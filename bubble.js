'use strict';

const log    = require ('ololog').noLocate;
const moment = require ('moment');
const math   = require ('mathjs');
const color  = require ('colors');
const initDatabases = require('./utils/db');

async function getMarkets () {
    if (!db) {
        var dbs = await initDatabases();
        var db = dbs.rw;
    }

    let markets = await db.collection('data').aggregate([
        {
            $group : {
                _id: '$market',
            }
        },
    ]);

    let response = await markets.toArray();
    log (response.length, 'markets');
    return response;
}

async function getExchanges () {
    if (!db) {
        var dbs = await initDatabases();
        var db = dbs.rw;
    }

    let e = await db.collection('data').aggregate([
        {
            $group : {
                _id: '$exchange',
            }
        },
    ]);

    let response = await e.toArray();
    log (response.length, 'exchanges');
    return response;
}

;(async function main() {
    await getMarkets();
    await getExchanges();
    process.exit(0);
}) ();

/*
366659268666.2889
976490244004.7288

(976490244004-366659268666)/366659268666*100=166%

 */