const ccxt   = require ('ccxt');
const log    = require ('ololog').noLocate;
const moment = require ('moment');
const color  = require ('colors');

;(async function main () {
    let e = process.argv[2];
    let symbol = process.argv[3];
    let exchange = new ccxt[e]();

    try {
        await exchange.loadMarkets ();
    } catch (error) {
        log (error);
    }

    let market = exchange.market(symbol);

    let since = moment().subtract(52, 'hours').valueOf();
    let data = await exchange.fetchOHLCV(symbol, '4h', since);

    for (let s = 0; s < data.length; s++) {
        let t = moment(data[s][0]).toISOString();
        let o = data[s][1];
        let h = data[s][2];
        let l = data[s][3];
        let c = color.bold(data[s][4].toFixed(market.precision.amount));
        let v = data[s][5];
        log(s+1,
            t,
            o.toFixed(market.precision.amount),
            h.toFixed(market.precision.amount),
            l.toFixed(market.precision.amount),
            c,
            v.toFixed(market.precision.amount));
    }
}) ();


