const mingo = require("mingo")
const _Buffer = require('buffer/')
const bitcoin = require('bsv');
const explorer = require('bitcore-explorers');
const defaults = {
  rpc: "https://api.bitindex.network",
  feeb: 1.4
}
// The end goal of 'build' is to create a hex formated transaction object
// therefore this function must end with _tx() for all cases 
// and return a hex formatted string of either a tranaction or a script
var build = function(options, callback) {
  let script = null;
  const rpcaddr = (options.pay && options.pay.rpc) ? options.pay.rpc : defaults.rpc;
  if (options.tx) {
    // if tx exists, check to see if it's already been signed.
    // if it's a signed transaction
    // and the request is trying to override using 'data' or 'pay',
    // we should throw an error
    const tx = new bitcoin.Transaction(options.tx)
    // transaction is already signed
    if (tx.inputs.length > 0 && tx.inputs[0].script) {
      if (options.pay || options.data) {
        callback(new Error("the transaction is already signed and cannot be modified"))
        return;
      }
    }
  } else {
    // construct script only if transaction doesn't exist
    // if a 'transaction' attribute exists, the 'data' should be ignored to avoid confusion
    if (options.data) {
      script = _script(options)
    }
  }

  const tx = new bitcoin.Transaction(options.tx);

  if (script) {
    tx.addOutput(new bitcoin.Transaction.Output({ script: script, satoshis: 0 }));
  }

  const opt_pay = options.pay || {};
  if (opt_pay.fee) {
    tx.fee(opt_pay.fee)
  } else {
    const feeb = opt_pay.feeb || defaults.feeb;
    tx.feePerKb(feeb * 1000);
  }

  // Instantiate pay
  if (options.pay && options.pay.key) {
    // key exists => create a signed transaction
    const key = options.pay.key;
    const privateKey = new bitcoin.PrivateKey(key);
    const address = privateKey.toAddress();
    tx.change(address)

    const insight = new explorer.Insight(rpcaddr)
    insight.getUnspentUtxos(address, function (err, res) {
      if (err) {
        callback(err);
        return;
      }

      if (options.pay.filter && options.pay.filter.q && options.pay.filter.q.find) {
        const f = new mingo.Query(options.pay.filter.q.find)
        res = res.filter(function(item) {
          return f.test(item)
        })
      }

      tx.from(res);

      if (options.pay.to && Array.isArray(options.pay.to)) {
        options.pay.to.forEach(function(receiver) {
          if (receiver.value >= 546) {
            tx.to(receiver.address, receiver.value)
          }
        })
      }

      tx.sign(privateKey);
      callback(null, tx);
    })
  } else {
    callback(null, tx);
  }
}
var send = function(options, callback) {
  if (!callback) {
    callback = function() {};
  }

  build(options, function(err, tx) {
    if (err) {
      callback(err);
      return;
    }

    let rpcaddr = (options.pay && options.pay.rpc) ? options.pay.rpc : defaults.rpc;
    const insight = new explorer.Insight(rpcaddr)
    insight.broadcast(tx.toString(), callback)
  })
}
// compose script
var _script = function(options) {
  var s = null;
  if (options.data) {
    if (Array.isArray(options.data)) {
      s = new bitcoin.Script();
      if (options.safe) {
        s.add(bitcoin.Opcode.OP_FALSE);
      }
      // Add op_return
      s.add(bitcoin.Opcode.OP_RETURN);
      options.data.forEach(function(item) {
        // add push data
        if (item.constructor.name === 'ArrayBuffer') {
          let buffer = _Buffer.Buffer.from(item)
          s.add(buffer)
        } else if (item.constructor.name === 'Buffer') {
          s.add(item)
        } else if (typeof item === 'string') {
          if (/^0x/i.test(item)) {
            // ex: 0x6d02
            s.add(Buffer.from(item.slice(2), "hex"))
          } else {
            // ex: "hello"
            s.add(Buffer.from(item))
          }
        } else if (typeof item === 'object' && item.hasOwnProperty('op')) {
          s.add({ opcodenum: item.op })
        }
      })
    } else if (typeof options.data === 'string') {
      // Exported transaction 
      s = bitcoin.Script.fromHex(options.data);
    }
  }
  return s;
}
var connect = function(endpoint) {
  var rpc = endpoint ? endpoint : defaults.rpc;
  return new explorer.Insight(rpc);
}
module.exports = {
  build: build,
  send: send,
  bsv: bitcoin,
  connect: connect,
}

