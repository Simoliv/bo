const ccxt   = require ('ccxt');
const log    = require ('ololog').noLocate;
const moment = require ('moment');
const color  = require ('colors');
const math       = require ('mathjs');

const len        = process.argv[2]; // wie viele candles in einer timeframe ?
const timeframe  = process.argv[3]; // Zahl
const timeframeP = process.argv[4]; // m (minutes) or h (hours)

;(async function main () {
    let e = process.argv[5];
    let symbol = process.argv[6];
    let exchange = new ccxt[e]();

    try {
        await exchange.loadMarkets ();
    } catch (error) {
        log (error);
    }

    let market = exchange.market(symbol);

    let timeToSub = math.evaluate(Number(timeframe)*Number(len)+Number(timeframe));
    let since = moment().subtract(timeToSub, timeframeP).valueOf();

    let data = await exchange.fetchOHLCV(symbol, timeframe+timeframeP, since);

    // vorsichtshalber noch mal sortieren !
    data.sort((a, b) => a[0] - b[0]);
    // letzte, unvollständige Kerze wegschneiden !
    data.splice(-1,1);

    log (data);

    let lastVolume = data[data.length-1][5];
    let lastClose  = data[data.length-1][4];
    let volume = 0;
    let close = 0;

    for (let s = 0; s < data.length; s++) {
        let t = moment(data[s][0]).toISOString();
        let o = data[s][1];
        let h = data[s][2];
        let l = data[s][3];
        let c = data[s][4];
        let v = data[s][5];
        log(s+1,
            t,
            o.toFixed(market.precision.amount),
            h.toFixed(market.precision.amount),
            l.toFixed(market.precision.amount),
            c,
            color.bold(v.toFixed(market.precision.amount)));

        volume = math.evaluate(volume + v);
        close  = math.evaluate(close + c);
    }

    let avgVolume = math.evaluate(Number(volume)/data.length-1);
    let avgClose  = math.evaluate(Number(close)/data.length-1);
    log (lastVolume,
        avgVolume,
        lastClose.toFixed(market.precision.amount),
        avgClose.toFixed(market.precision.amount));
    
}) ();


