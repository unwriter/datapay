const assert = require("assert");
const sinon = require("sinon");
const bsv = require("bsv");
const datapay = require("../index");

const sandbox = sinon.createSandbox();

// fake input data
const toAddress1 = "1DnFt3kHih4jkAbGYsF8wPhoisuM3vkWLN";
const toAddress2 = "1LTLNv4SCF9pjj73t5ZEt5fYrWWadwfMFB";
const privateKey = "Ky1WGEzN2Jn6CezPWdYMqTJzcBTJuFaMhna6wBpycg1wzVBUXcHC";
const privateKeyRedeem = "76a914ee305aa2a75dbeff6f8f960eb1b7b16eb1d3b2df88ac";
const utxos = [
  {
    txid: "8a06f5d5449c0f68291171ad1a7cc427db9bef5abb93998b40c999f5e933eb89",
    vout: 2,
    amount: 0.045,
    script: privateKeyRedeem
  },
  {
    txid: "23cad3adb933c194b57b9d8db22a977b281f7279f040c319a9552c3378a70f5a",
    vout: 4,
    satoshis: 10000,
    scriptPubKey: privateKeyRedeem
  }
];

describe("datapay", function() {
  afterEach(function() {
    sandbox.restore();
  });

  describe("#createDataScript()", function() {
    describe("with a pushdata array", function() {
      it("should add an opcode", function() {
        const script = datapay.createDataScript([{ op: 78 }, "hello world"]);
        assert.equal(
          script.toASM(),
          "OP_RETURN OP_PUSHDATA4 68656c6c6f20776f726c64"
        );
      });

      it("should add a buffer", function() {
        const script = datapay.createDataScript([
          Buffer.from("abc"),
          "hello world"
        ]);

        assert.equal(script.toASM(), "OP_RETURN 616263 68656c6c6f20776f726c64");
      });

      it("should add a utf-8 string", function() {
        const script = datapay.createDataScript(["hello world"]);
        assert.equal(script.toASM(), "OP_RETURN 68656c6c6f20776f726c64");
      });

      it("should add a hex string", function() {
        const script = datapay.createDataScript(["0x6d02", "hello world"]);
        assert.equal(script.toASM(), "OP_RETURN 6d02 68656c6c6f20776f726c64");
      });

      it("should add OP_0 with safe option", function() {
        const script = datapay.createDataScript(["hello world"], true);
        assert.equal(script.toASM(), "0 OP_RETURN 68656c6c6f20776f726c64");
      });
    });

    it("should build from a hex string", function() {
      const script = datapay.createDataScript(
        "6a04366430320b68656c6c6f20776f726c64"
      );

      assert.equal(script.toASM(), "OP_RETURN 36643032 68656c6c6f20776f726c64");
    });
  });

  describe("#build()", function() {
    describe("with data", function() {
      it("should add OP_0 with safe option", async function() {
        const options = { data: ["hello world"], safe: true };
        const tx = await datapay.build(options);
        assert.equal(tx.outputs.length, 1);
        assert.equal(
          tx.outputs[0].script.toASM(),
          "0 OP_RETURN 68656c6c6f20776f726c64"
        );
      });

      it("should add a data output", async function() {
        const options = { data: ["hello world"] };
        const tx = await datapay.build(options);
        assert.equal(tx.outputs.length, 1);
        assert.equal(
          tx.outputs[0].script.toASM(),
          "OP_RETURN 68656c6c6f20776f726c64"
        );
      });
    });

    describe("with callback", function() {
      it("should build a transaction", function(done) {
        sandbox.stub(datapay, "getUTXOs").resolves(utxos);

        const options = { pay: { key: privateKey } };
        datapay.build(options, (err, tx) => {
          try {
            assert(tx, "a transaction was not returned in the callback");
            done();
          } catch (err) {
            done(err);
          }
        });
      });

      it("should handle getUTXOs error", function(done) {
        sandbox.stub(datapay, "getUTXOs").rejects();

        const options = { pay: { key: privateKey } };
        datapay.build(options, (err, tx) => {
          try {
            assert(err, "an error was not returned in the callback");
            done();
          } catch (err) {
            done(err);
          }
        });
      });
    });

    describe("with async/await", function() {
      it("should build a transaction", async function() {
        sandbox.stub(datapay, "getUTXOs").resolves(utxos);

        const options = {
          pay: { key: privateKey, to: [{ address: toAddress1, value: 5000 }] },
          data: ["async", "await"]
        };
        const tx = await datapay.build(options);
        assert(tx.inputs.length, 2);
        assert(tx.outputs.length, 3);
        assert(tx.isFullySigned());
      });

      it("should handle getUTXOs error", async function() {
        sandbox.stub(datapay, "getUTXOs").rejects();

        const options = { pay: { key: privateKey } };
        await assert.rejects(async () => await datapay.build(options));
      });
    });

    it("should send output to address", async function() {
      const options = { pay: { to: [{ address: toAddress1, value: 100000 }] } };
      const tx = await datapay.build(options);
      assert.equal(tx.outputs.length, 1);
      assert.equal(tx.outputs[0].satoshis, 100000);
      assert.equal(
        tx.outputs[0].script.toHex(),
        "76a9148c30a62437626c504205900ed6def906b0b0b3fd88ac"
      );
    });

    it("should add change output", async function() {
      sandbox.stub(datapay, "getUTXOs").resolves(utxos);

      const options = { pay: { key: privateKey } };
      const tx = await datapay.build(options);
      const changeOutput = tx.getChangeOutput();
      assert(changeOutput);
      assert.equal(changeOutput.script.toHex(), privateKeyRedeem);
    });

    it("should apply fixed fee", async function() {
      sandbox.stub(datapay, "getUTXOs").resolves(utxos);

      const options = { pay: { key: privateKey, fee: 500 } };
      const tx = await datapay.build(options);
      assert.equal(tx.getFee(), 500);
    });

    it("should apply custom fee rate", async function() {
      sandbox.stub(datapay, "getUTXOs").resolves(utxos);

      const options = { pay: { key: privateKey, feeb: 5.0 } };
      const tx = await datapay.build(options);
      assert.equal(tx._feePerKb, 5000);
    });

    it("should filter utxo's", async function() {
      sandbox.stub(datapay, "getUTXOs").resolves(utxos);

      const prevTxId =
        "8a06f5d5449c0f68291171ad1a7cc427db9bef5abb93998b40c999f5e933eb89";
      const options = {
        pay: {
          key: privateKey,
          filter: utxos => utxos.filter(utxo => utxo.txid === prevTxId)
        }
      };
      const tx = await datapay.build(options);
      assert.equal(tx.inputs.length, 1);
      assert.equal(tx.inputs[0].prevTxId.toString("hex"), prevTxId);
    });
  });

  describe("#send()", function() {
    const tx = bsv
      .Transaction()
      .from(utxos)
      .change(toAddress2)
      .to(toAddress1, 5000)
      .sign(privateKey);

    describe("with callback", function() {
      it("should broadcast a transaction", function(done) {
        const broadcastFake = sandbox.fake.resolves(tx.hash);
        sandbox.replace(datapay, "broadcast", broadcastFake);

        datapay.send({ tx }, (err, txid) => {
          try {
            assert(broadcastFake.called, "transaction was not broadcast");
            assert.equal(txid, tx.hash);
            done();
          } catch (err) {
            done(err);
          }
        });
      });

      it("should propagate a build error", function(done) {
        sandbox.stub(datapay, "build").rejects();

        const options = { pay: { key: privateKey } };
        datapay.send(options, (err, txid) => {
          try {
            assert(err, "an error was not returned in the callback");
            done();
          } catch (err) {
            done(err);
          }
        });
      });

      it("should propagate a broadcast error", function(done) {
        sandbox.stub(datapay, "getUTXOs").resolves(utxos);
        sandbox.stub(datapay, "broadcast").rejects();

        const options = { pay: { key: privateKey } };
        datapay.send(options, (err, txid) => {
          try {
            assert(err, "an error was not returned in the callback");
            done();
          } catch (err) {
            done(err);
          }
        });
      });

      it("should propagate a serialization error", function(done) {
        // sending an unsigned transaction
        const tx = bsv
          .Transaction()
          .from(utxos)
          .change(toAddress1);

        datapay.send({ tx }, (err, txid) => {
          try {
            assert(err, "an error was not returned in the callback");
            done();
          } catch (err) {
            done(err);
          }
        });
      });
    });

    describe("with async/await", function() {
      it("should broadcast a transaction", async function() {
        const broadcastFake = sandbox.fake.resolves(tx.hash);
        sandbox.replace(datapay, "broadcast", broadcastFake);

        const txid = await datapay.send({ tx });
        assert(broadcastFake.called, "transaction was not broadcast");
        assert.equal(txid, tx.hash);
      });

      it("should propagate a build error", async function() {
        sandbox.stub(datapay, "build").rejects();

        const options = { pay: { key: privateKey } };
        assert.rejects(datapay.send(options));
      });

      it("should propagate a broadcast error", async function() {
        sandbox.stub(datapay, "getUTXOs").resolves(utxos);
        sandbox.stub(datapay, "broadcast").rejects();

        const options = { pay: { key: privateKey } };
        assert.rejects(datapay.send(options));
      });

      it("should propagate a serialization error", async function() {
        // sending an unsigned transaction
        const tx = bsv
          .Transaction()
          .from(utxos)
          .change(toAddress1);

        assert.rejects(datapay.send({ tx }));
      });
    });

    it("should build a transaction if not supplied", async function() {
      const broadcastFake = sandbox.fake.resolves("faketxid");
      const buildFake = sandbox.fake.resolves(tx);
      sandbox.replace(datapay, "broadcast", broadcastFake);
      sandbox.replace(datapay, "build", buildFake);
      sandbox.stub(datapay, "getUTXOs").resolves(utxos);

      const options = {
        pay: { key: privateKey, to: [{ address: toAddress1, value: 5000 }] }
      };
      const txid = await datapay.send(options);

      assert.equal(txid, "faketxid", "transaction was not broadcast");
      assert(buildFake.calledWith(options));
      assert(broadcastFake.calledWith(tx.serialize()));
    });
  });
});
