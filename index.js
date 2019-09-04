const axios = require("axios");
const bsv = require("bsv");

const defaults = { feeb: 1.0 };
let insight;

const connect = (url = "https://api.bitindex.network/api/v3/main", headers) => {
  insight = { url, headers };
};

const getUTXOs = async address => {
  const res = await axios.post(
    `${insight.url}/addrs/utxo`,
    { addrs: address.toString() },
    { headers: { ...insight.headers } }
  );

  return res.data;
};

const broadcast = async rawtx => {
  const res = await axios.post(
    `${insight.url}/tx/send`,
    { rawtx },
    { headers: { ...insight.headers } }
  );

  return res.data;
};

const build = async ({ data, safe, pay }) => {
  const tx = new bsv.Transaction();

  if (data.length) {
    const script = createDataScript(data, safe);
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

const send = async options => {
  const tx = options.tx || (await build(options));
  return await broadcast(tx.serialize());
};

const createDataScript = (data, safe) => {
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

const callbackWrapper = func => {
  return async (options, callback) => {
    try {
      result = await func(options);
      if (callback) callback(null, result);
      else return result;
    } catch (err) {
      if (callback) callback(err);
      else throw err;
    }
  };
};

connect();

module.exports = {
  build: callbackWrapper(build),
  send: callbackWrapper(send),
  connect
};
