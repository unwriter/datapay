require("buffer");
const bsv = require("bsv");
const { Insight } = require("bitcore-explorers");

const defaults = {
  rpc: "https://api.bitindex.network",
  feeb: 1.0
};

let insight;

const connect = (endpoint, network = "livenet") => {
  insight = new Insight(endpoint || defaults.rpc, network);
};

const getUTXOs = address =>
  new Promise((resolve, reject) => {
    insight.getUnspentUtxos(address, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });

const broadcast = rawtx =>
  new Promise((resolve, reject) => {
    insight.broadcast(rawtx, (err, txid) => {
      if (err) reject(err);
      else resolve(txid);
    });
  });

const build = async ({ data, safe, pay }) => {
  const tx = new bsv.Transaction();

  const script = createDataScript(data, safe);
  if (script) {
    tx.addOutput(new bsv.Transaction.Output({ script, satoshis: 0 }));
  }

  const { fee, feeb, key, to = [], filter } = pay;

  if (fee) tx.fee(fee);
  else tx.feePerKb((feeb || defaults.feeb) * 1000);

  to.forEach(receiver => tx.to(receiver.address, receiver.value));

  if (key) {
    const privateKey = new bsv.PrivateKey(key);
    const address = privateKey.toAddress();
    tx.change(address);

    let utxos = await getUTXOs(address);
    if (filter) utxos = utxos.filter(filter);
    tx.from(utxos);

    tx.sign(privateKey);
  }

  return tx;
};

const send = async (options, tx) => {
  if (options && !tx) tx = await build(options);
  return await broadcast(tx.serialize());
};

const createDataScript = (data, safe) => {
  if (!data) return;
  if (typeof data === "string") return bsv.Script.fromHex(data);

  const s = new bsv.Script();

  // Add OP_RETURN
  if (safe) s.add(bsv.Opcode.OP_FALSE);
  s.add(bsv.Opcode.OP_RETURN);

  // Add data
  data.forEach(item => {
    if (typeof item === "object" && item.hasOwnProperty("op")) {
      s.add({ opcodenum: item.op });
      return;
    }

    if (typeof item === "string" && /^0x/i.test(item)) {
      // e.g. 0x6d02
      s.add(Buffer.from(item.slice(2), "hex"));
      return;
    }

    s.add(Buffer.from(item));
  });

  return s;
};

insight = connect();

module.exports = {
  build,
  send,
  connect
};
