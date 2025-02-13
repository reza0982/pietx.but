const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

const rpcUrl = "https://rpc-polygon.harpie.io";  // Ganti dengan RPC lain jika perlu
const web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));

const contractABI = require('./src/abi');
const config = require('./config');

const contractAddress = '0x1Cd0cd01c8C902AdAb3430ae04b9ea32CB309CF1';  // Kontrak WPOL
const spenderAddress = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const contract = new web3.eth.Contract(contractABI, contractAddress);
const amount = web3.utils.toWei(config.amountToWrap.toString(), 'ether');

/**
 * Mengecek izin WPOL dan melakukan approval jika diperlukan.
 */
async function approveWPOL(account, walletNumber) {
    try {
        const allowance = await contract.methods.allowance(account.address, spenderAddress).call();
        const maxUint256 = web3.utils.toBN("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

        if (web3.utils.toBN(allowance).lt(web3.utils.toBN(amount))) {
            console.log(`[${walletNumber}] Approving WPOL...`);
            const data = contract.methods.approve(spenderAddress, maxUint256).encodeABI();
            
            const tx = {
                from: account.address,
                to: contractAddress,
                gas: 100000,
                data: data
            };

            const signedTx = await web3.eth.accounts.signTransaction(tx, account.privateKey);
            const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
            console.log(`[${walletNumber}] Approval successful! Tx Hash: ${receipt.transactionHash}`);
        } else {
            console.log(`[${walletNumber}] WPOL allowance is already sufficient.`);
        }
    } catch (error) {
        console.error(`[${walletNumber}] Approval failed:`, error);
    }
}

/**
 * Mengecek saldo akun sebelum melakukan transaksi.
 */
async function isBalanceSufficient(account, walletNumber) {
    try {
        const balance = await web3.eth.getBalance(account.address);
        const gasPrice = await web3.eth.getGasPrice();
        const estimatedGas = web3.utils.toBN(2000000);
        const requiredGas = web3.utils.toBN(gasPrice).mul(estimatedGas);

        if (web3.utils.toBN(balance).lt(web3.utils.toBN(amount).add(requiredGas))) {
            console.log(`[${walletNumber}] Insufficient balance for gas.`);
            return false;
        }
        return true;
    } catch (error) {
        console.error(`[${walletNumber}] Error checking balance:`, error);
        return false;
    }
}

/**
 * Melakukan wrapping WPOL → tPOL.
 */
async function wrapTokens(account, walletNumber, numTransactions) {
    try {
        await approveWPOL(account, walletNumber);

        for (let i = 0; i < numTransactions; i++) {
            if (!(await isBalanceSufficient(account, walletNumber))) {
                console.log(`[${walletNumber}] Skipping transaction due to low balance.`);
                continue;
            }

            console.log(`[${walletNumber}] Wrapping ${web3.utils.fromWei(amount, 'ether')} WPOL to tPOL...`);
            const data = contract.methods.wrap(amount, account.address).encodeABI();

            const tx = {
                from: account.address,
                to: contractAddress,
                gas: 2000000,
                data: data
            };

            const signedTx = await web3.eth.accounts.signTransaction(tx, account.privateKey);
            const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
            console.log(`[${walletNumber}] Wrap successful! Tx Hash: ${receipt.transactionHash}`);
        }
    } catch (error) {
        console.error(`[${walletNumber}] Wrapping failed:`, error);
    }
}

/**
 * Membaca private keys dari `priv.txt` dan menjalankan wrapping untuk setiap akun.
 */
async function executeTransactions() {
    const privateKeys = fs.readFileSync(path.join(__dirname, 'priv.txt'), 'utf-8')
        .split('\n')
        .map(key => key.trim())
        .filter(key => key.length === 64);

    if (privateKeys.length === 0) {
        console.error('No valid private keys found in priv.txt.');
        return;
    }

    for (const [index, privateKey] of privateKeys.entries()) {
        const walletNumber = index + 1;
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        console.log(`[${walletNumber}] Processing account: ${account.address}`);
        await wrapTokens(account, walletNumber, config.repeat);
    }
}

executeTransactions();
