const ccxt       = require ('ccxt');
const log        = require ('ololog').noLocate;
const moment     = require ('moment');
const math       = require ('mathjs');
const color      = require ('colors');
const sleep      = require ('sleep');
const initdb     = require('./utils/db');
const blacklist  = require ('./config/blacklist.json').blacklist;
const len        = process.argv[2]; // wie viele candles in einer timeframe ?
const timeframe  = process.argv[3]; // Zahl
const timeframeP = process.argv[4]; // m (minutes) or h (hours)

/*
 example : node loader.js 12 15 m
 holt 12 Kerzen a 15m = 180 min = 3 Stunden
 */

async function saveData (db = {}, data) {
    let query = {
        exchange : data.exchange,
        market : data.market,
        timeframe : data.timeframe,
    };

    delete data.exchange;
    delete data.market;
    delete data.timeframe;

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
    let start = moment().toISOString();
    if (!len) {
        log ('need length');
        process.exit (1);
    }

    if (!timeframe) {
        log ('need timeframe');
        process.exit (1);
    }

    let tf = timeframe+timeframeP;

    const dbs = await initdb();
    const db = dbs.rw;

    let mcnt = 1;
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

        // check if exchange support candles, if not, skip
        if (exchange.has.fetchOHLCV) {
            let markets;
            try {
                markets = await exchange.loadMarkets ();
            } catch (error) {
                log (error);
                continue;
            }

            // goto marker..
            exchange:
            for (const m of Object.keys(markets)) {
                if (m.match(/Token/) ||
                        m.match(/3L/) ||
                        m.match(/5L/) ||
                        m.match(/ERC/) ||
                        m.match(/_/) ||
                        m.match(/^[0-9]/) ||
                        m.match(/PERP/) ||
                        m.match(/BULL/) ||
                        m.match(/BEAR/) ||
                        m.match(/3S/) ||
                        m.match(/^USD/) ||
                        m.match(/5S/)
                ) {
                    log (color.red('contract, token, future or leveraged market found, skip'), m, '\n');
                    continue;
                }

                let timeToSub = math.evaluate(Number(timeframe)*Number(len)+Number(timeframe));
                let since = moment().subtract(timeToSub, timeframeP).valueOf();

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
                    data = await exchange.fetchOHLCV(m, tf, since);
                } catch (error) {
                    log (e, m, error);
                    break;
                }

                data.sort((a, b) => a[0] - b[0]);
                // letzte, unvollständige Kerze wegschneiden !
                data.splice(-1,1);

                let p = 0;
                let x = 0;

                // Wenn die Daten nicht vollständig sind, wegschmeissen, nächste
                if (data.length < len) {
                    log (e, m, 'incomplete data, skip', data.length, '\n');
                    fail++;
                    if (fail > 10) {
                        log ('fail count');
                        break exchange;
                    }
                    continue;
                }

                // when we reached this, we have data to do our job ..
                let volume = 0;
                let close = 0;

                for (let s = 0; s < data.length; s++) {
                    let t = moment(data[s][0]).toISOString();
                    let o = data[s][1];
                    let h = data[s][2];
                    let l = data[s][3];
                    let c = data[s][4];
                    let v = data[s][5];
                    //log (s, e, m, t, o, h, l, c, v);

                    /*
                    // Insert documents to mongo
                    let query = {
                        exchange : e,
                        market : m,
                        timestamp : new Date(t),
                        timeframe: tf,
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
                     */

                    volume = math.evaluate(volume + v);
                    close  = math.evaluate(close + c);
                }

                let lastVolume = data[data.length-1][5];
                let lastClose  = data[data.length-1][4];

                if (lastVolume == 0) {
                    continue;
                }

                if (volume > 0) {
                    let avgVolume = math.evaluate(Number(volume)/data.length-1);
                    let avgClose  = math.evaluate(Number(close)/data.length-1);

                    let colV = "gray";
                    let colC = "gray";
                    let vt = 0;
                    let ct = 0;
                    let insert = false;

                    // ausrechnen wie hoch die Abweichung ist
                    let deviationVolume = math.evaluate(((lastVolume-avgVolume)/avgVolume)*100);
                    let deviationClose = math.evaluate(((lastClose-avgClose)/avgClose)*100);

                    if (Number(deviationVolume) > Number(250)) {
                        colV = "red";
                        insert = true;
                        vt = 1;
                    }

                    if (Number(deviationClose) > Number(150)) {
                        colC = "red";
                        insert = true;
                        ct = 1;
                    } else if (Number(deviationClose) < Number(50)) {
                        insert = false;
                    }

                    log (mcnt++, e, m);
                    log('volume average:   ', avgVolume, '\n',
                        'volume last:      ', lastVolume, '\n',
                        'volume deviation: ', color[colV](deviationVolume.toFixed(2)+'%'), '\n',
                        'close mean:       ', avgClose, '\n',
                        'close last:       ', lastClose,'\n',
                        'close deviation:  ', color[colC](deviationClose.toFixed(2)+'%'), '\n',
                        );
                    fail = 0;

                    if (insert) {
                        await saveData (db, {
                            exchange    : e,
                            market      : m,
                            base        : exchange.market(m).base,
                            quote       : exchange.market(m).quote,
                            timestamp   : new Date(),
                            timeframe   : tf,
                            vmean       : avgVolume,
                            vlast       : lastVolume,
                            vdev        : deviationVolume,
                            vt          : vt,
                            cmean       : avgClose,
                            clast       : lastClose,
                            cdev        : deviationClose,
                            ct          : ct,
                        });
                    }
                    delete data;
                } else {
                    log (e, m, 'volume 0 .. skip');
                }
            }
        } else {
            log (e, 'does not support OHCLV data');
            continue;
        }
        log ('garbage collection');
        global.gc();
    }
    let end = moment().toISOString();

    log (start, end);
    process.exit(0);
}) ();