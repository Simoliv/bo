'use strict';

const ccxt      = require ('ccxt');
const log       = require ('ololog').noLocate;
const moment    = require ('moment');
const math      = require ('mathjs');
const color     = require ('colors');
const initdb    = require('./utils/db');
const blacklist = require ('./config/blacklist.json').blacklist;
const len       = process.argv[2];

async function saveData (db = {}, data) {
    let query = {
        exchange : data.exchange,
        market : data.market,
    };

    delete data.exchange;
    delete data.market;

    await db.collection('bubble').updateOne(
        query,
        {
            $set: data
        },
        {
            upsert: true,
            multi: false,
        },
        function (err, result) {
            if (err) {
                throw (err);
                process.exit(1);
            }
        }
    );
}

;(async function main () {
  if (!len) {
    log ('need length');
    process.exit (1);
  }

  if (!db) {
    var dbs = await initdb();
    var db = dbs.rw;
  }

  let mcnt = 1;
  let ecnt = 0;
  let fail = 0;
  for (let i in ccxt.exchanges) {
    let e = ccxt.exchanges[i];

    if (blacklist.includes(e)) {
      log (e, 'blacklisted');
      continue;
    }

    // initiate exchange
    let exchange = new ccxt[e]({
        'enableRateLimit': true,
    });
    if (exchange.has.fetchOHLCV) {
      let markets;
      try {
        markets = await exchange.loadMarkets ();
      } catch (error) {
        log (error);
        continue;
      }

      exchange:
      for (const m of Object.keys(markets)) {
          if (m.match(/Token/) ||
            m.match(/3L/) ||
            m.match(/ERC/) ||
            m.match(/_/) ||
            m.match(/^[0-9]/) ||
            m.match(/PERP/) ||
            m.match(/BULL/) ||
            m.match(/3S/)
          ) {
            log (color.red('contract, token, future or leveraged market found, skip'), m, '\n');
            continue;
          }
        let since = moment().subtract(52, 'hours').valueOf();
        try {
          /*
            1504541580000, // UTC timestamp in milliseconds, integer
            4235.4,        // (O)pen price, float
            4240.6,        // (H)ighest price, float
            4230.0,        // (L)owest price, float
            4230.7,        // (C)losing price, float
            37.72941911    // (V)olume (in terms of the base currency), float
           */
          let data;
          try {
            data = await exchange.fetchOHLCV(m, '4h', since);
          } catch (error) {
            log (e, m, error);
            break;
            //continue;
          }
          let p = 0;
          let x = 0;
          if (data.length < len) {
            log (e, m, 'incomplete data, skip', '\n');
            fail++;
            if (fail > 4) {
              log ('fail count');
              break exchange;
            }
            continue;
          }
          for (let s = 0; s < data.length-1; s++) {
            let t = moment(data[s][0]).toISOString();
            let o = data[s][1];
            let h = data[s][2];
            let l = data[s][3];
            let c = data[s][4];
            let v = data[s][5];
            //log (s, e, m, t, o, h, l, c, v);

            // Insert documents to mongo
            let query = {
              exchange : e,
              market : m,
              timestamp : new Date(t),
            };
            await db.collection('data').updateOne(
                query,
                {
                  $set:
                      {
                          open:   Number(o),
                          high:   Number(h),
                          low:    Number(l),
                          close:  Number(c),
                          volume: Number(v),
                          base:   exchange.market(m).base,
                          quote:  exchange.market(m).quote,
                      },
                },
                {
                  upsert: true,
                  multi: false,
                },
                function (err, result) {
                  if (err) {
                    throw (err);
                    process.exit(1);
                  }
                }
            );
            // close price
            p = (p+c);
            // volume
            x = (x+v);

          }
          //log ('12', e, m, moment(data[12][0]).toISOString(), data[12][1], data[12][2], data[12][3], data[12][4], data[12][5]);
          let lastV = Number(data[11][5]);
          let lastC = Number(data[11][4]);

          if (lastV == 0) {
              continue;
          }

          if (x > 0) {
            // calculate moving average
            let mav = math.evaluate(x/len);
            let mac = math.evaluate(p/len);
            let colV = "gray";
            let colC = "gray";
            let insert = false;

            // ausrechnen wie hoch die Abweichung ist
            let deviationV = math.evaluate(((lastV-mav)/mav)*100);
            let deviationC = math.evaluate(((lastC-mac)/mac)*100);
            if (Number(deviationV) > Number(250)) {
                colV = "red";
                insert = true;
            }
            if (Number(deviationC) > Number(30)) {
                colC = "red";
                insert = true;
            } else if (Number(deviationC) < Number(10)) {
                insert = false;
            }

            log (mcnt++, e, m);
            log('vol mean:       ', mav, '\n',
                'vol last:       ', lastV, '\n',
                'vol deviation:  ', color[colV](deviationV.toFixed(2)+'%'), '\n',
                'close mean:     ', mac, '\n',
                'close last:     ', lastC,'\n',
                'close deviation:', color[colC](deviationC.toFixed(2)+'%'), '\n',
                );
            fail = 0;
            if (insert) {
                await saveData (db, {
                    exchange    : e,
                    market      : m,
                    base        : exchange.market(m).base,
                    quote       : exchange.market(m).quote,
                    timestamp   : new Date(),
                    vmean       : mav,
                    vlast       : lastV,
                    vdev        : deviationV,
                    cmean       : mac,
                    clast       : lastC,
                    cdev        : deviationC,
                });
            }
          } else {
            log (e, m, 'volume 0 .. skip');
          }
        } catch (error) {
          log (e, m, error);
          break exchange;
        }
      }
    }
    else {
      log (e, 'does not support OHCLV data');
    }
  }
  process.exit(0);
}) ();