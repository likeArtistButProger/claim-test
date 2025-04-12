import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, TransactionSignature } from "@solana/web3.js";
import bs58 from "bs58";
import * as dotenv from "dotenv";

dotenv.config();

const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

const pk = bs58.decode(process.env.PK ?? "");
const owner = Keypair.fromSecretKey(pk);

const claimerPk = bs58.decode(process.env.CLAIMER_PK ?? "");
const claimer = Keypair.fromSecretKey(claimerPk);

const amount = 0.001 * LAMPORTS_PER_SOL;

async function callWithRetries<T>(func: () => Promise<T>, maxRetries: number) {
    let retries = 0;
    while(retries < maxRetries) {
        try {
            return await func();
        } catch (err) {
            if(retries === maxRetries - 1) {
                console.error("Failed to send tx:", err);
            }
            retries++;
        }
    }
}

async function main() {

    const temp = Keypair.generate();

    console.log({
        tempPk: bs58.encode(temp.secretKey),
        tempPub: temp.publicKey,
    })

    let blockhash = await connection.getLatestBlockhash();
    const txOwnerToTemp = new Transaction();
    txOwnerToTemp.recentBlockhash = blockhash.blockhash;
    txOwnerToTemp.add(SystemProgram.transfer({
        fromPubkey: owner.publicKey,
        toPubkey: temp.publicKey,
        lamports: amount,
    }));
    txOwnerToTemp.sign(owner);
    const txHash = await callWithRetries<string>(async () => connection.sendRawTransaction(txOwnerToTemp.serialize()), 5);

    if(!txHash) {
        return;
    }

    await connection.confirmTransaction({ signature: txHash, blockhash: blockhash.blockhash, lastValidBlockHeight: blockhash.lastValidBlockHeight }, "finalized");

    blockhash = await connection.getLatestBlockhash();
    const tx = new Transaction();
    tx.recentBlockhash = blockhash.blockhash;
    tx.add(SystemProgram.transfer({
        fromPubkey: owner.publicKey,
        toPubkey: claimer.publicKey,
        lamports: amount,
    }));

    tx.feePayer = claimer.publicKey;

    tx.sign(owner);

    const serializedTransaction = tx.serialize({requireAllSignatures: false}).toString('base64');
    console.log("Serialized transaction:", serializedTransaction);

    // NOTE(Nikita): Frontend imitation
    const deserializedTransaction = Transaction.from(Buffer.from(serializedTransaction, 'base64'));

    deserializedTransaction.partialSign(claimer);

    const serializedFinal = deserializedTransaction.serialize();

    const signature = await callWithRetries(async () => connection.sendRawTransaction(serializedFinal), 5);
    console.log("Claim sent with signature:", signature);
}

main();
