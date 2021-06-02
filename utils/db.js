const MongoClient = require('mongodb').MongoClient;
const log = require('ololog').noLocate;

const RW = "mongodb://localhost:27017/bubble";
const RO = "mongodb://localhost:27017/bubble";

function connect(url) {
    return MongoClient.connect(url, {
        useUnifiedTopology: true,
        poolSize: 20,
    }).then(client => client.db());
}

module.exports = async function() {
    //let db = await connect(PROD_URI);
    let dbs = await Promise.all([
        connect(RW),
        connect(RO)
    ]);

    return {
        rw : dbs[0],
        ro : dbs[1],
    };
}