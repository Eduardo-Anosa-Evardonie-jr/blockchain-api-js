'use strict';

const invariant = require('fbjs/lib/invariant');
const _ = require('lodash');
const toHex = require('../utils/to-hex');
const initContract = require('../utils/init-contract');

class Votes {
    constructor({account, config}) {
        invariant(account, 'account is not defined');

        this._accountAddress = account.getAddress();
        this._geth = account.geth;
        this._gasLimit = account.getGasLimit();
        this._token = account.tokens[Object.keys(account.tokens)[0]];
        this._votes = {};
        this._votesInfo = {};
        this._currentVote = 0;
        this._config = config;
    }

    async init() {
        this._registry = await initContract('votingRegistry', this._geth);
        this._registry = await this._registry.at(this._config.contractAddress.votingRegistry);

        this._voting = await initContract('voting', this._geth);

        if (Object.keys(this._votes).length === 0) {
            const addresses = await this._registry.getVotings();

            for (const address of addresses) {
                this._votes[address] = await this._voting.at(address);
            }
        }

        return true;
    }

    async getList() {
        let result = [];
        for (const address in this._votes) {
            await this.getVoteInfo(address)
        }

        return _.values(this._votesInfo);
    }

    setCurrent(address) {
        this._currentVote = address;
    }

    getCurrent() {
        return this._currentVote;
    }

    async getVoteInfo( address = null, useCache = true ) {
        address = address || this.getCurrent();

        if ( !this._votesInfo[address] || !useCache ) {
            const [title, description, starttime, endtime, finishedAheadTime, winner] = await Promise.all([
                this._votes[address].getTitle(),
                this._votes[address].getDescription(),
                this._votes[address].getStartTime(),
                this._votes[address].getEndTime(),
                this._votes[address].isFinishedAheadOfTime(),
                this._votes[address].getWinnerOption()
            ]);

            this._votesInfo[address] = {
                address,
                title,
                description,
                starttime: _.get(starttime, 'c[0]'),
                endtime: _.get(endtime, 'c[0]'),
                finishedAheadTime,
                winner,
                options: [],
            }
        }

        return this._votesInfo[address];
    }

    async getVoteFullInfo( useCache = false ) {
        const vote = this._votes[this.getCurrent()];


        const [ info, options] = await Promise.all([
            this.getVoteInfo(this.getCurrent(), useCache ),
            vote.getNumberOfOptions()
        ]);

        //update options anyway
        info.options = [];

        for (let i = 0; i < options.toNumber(); i++) {
            const [title, description, votes, weights] = await Promise.all([
                vote.getTitleFor(i),
                vote.getDescriptionFor(i),
                vote.getVotesFor(i),
                vote.getWeightsFor(i)
            ]);

            info.options.push({
                index: i,
                title: title,
                description: description,
                votes: votes.toNumber(),
                weight: weights.toNumber()
            });
        }

        return info;
    }

    async vote(option, qt = 1) {
        const vote = this._votes[this.getCurrent()];
        const params = this.getTransactionParams();

        const result = await this._token.contract.approve(this.getCurrent(), qt, params);

        if (result) {
            return await vote.voteFor(option, params);
        }
    }

    async getVoteBalanceForOptions() {
        const res = [];
        const vote = this._votes[this.getCurrent()]
        const options = await vote.getNumberOfOptions();

        for (let i = 0; i < options.toNumber(); i++) {
            res.push(
                (await vote.getBalanceFor(this._accountAddress, i, this.getTransactionParams())).toNumber()
            ) ;
        }

        return res;
    }

    async getVoteBalance() {
        const vote = this._votes[this.getCurrent()]

        return (await vote.getBalanceOf(this._accountAddress, this.getTransactionParams())).toNumber()
    }

    getTransactionParams() {
        return {
            from: this._accountAddress,
            gasLimit: toHex(this._gasLimit),
        };
    }
}

module.exports = Votes;