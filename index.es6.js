'use strict';

var _ = require('lodash');

var Financial = require('financial-calculator-engine'),
	CalculatorEngine = Financial.CalculatorEngine;

//
class LoanContext {
	constructor(context) {
		super();

		this.principal = 0;
		this.interestRate = 0;
		this.interestRateFrequency = Financial.config.frequency.year;
		this.term = 0;
		this.termFrequency = Financial.config.frequency.year;
		this.repaymentFrequency = Financial.config.frequency.month;

		// ES6 comes with Object.assign();
		_.assign(this, context);
	}

	// Calculate the interest rate per period.
	getEffInterestRate() {
		return this.interestRate * this.interestRateFrequency / this.repaymentFrequency;
	}

	// Calculate the total number of periods for a given loan.
	getEffTerm() {
		return this.term / this.termFrequency * this.repaymentFrequency;
	}
}

//
class LoanSummaryItem {
	constructor(periodAt) {
		this.period = periodAt;
		this.principalInitialBalance = 0;
		this.principalFinalBalance = 0;
		this.interestPaid = 0;
		this.principalPaid = 0;
		this.pmt = 0;
	}
}

//
class LoanCalculatorEngine extends CalculatorEngine {
	constructor(context) {
		super();

		this.__baseContext = new LoanContext(context);
	}

	__flattenContext(operatorsList) {
		// Instanciate new context
		var target = new LoanContext();

		// Extract contexts from operators list
		var operatorsContextList = operatorsList.map(function(operator) {
			return operator.context;
		});

		// Create an array with all contexts to be flattened
		// [target, __baseContext, ...operatorContext]
		var contextStack = [target, this.__baseContext].concat(operatorsContextList);

		// Flatten contexts by merging/assigning all properties into the target context
		// ES6 has with Object.assign();
		_.assign.apply(_, contextStack);

		// Return the target object
		return target;
	}

	getContextAt(period) {
		var operatorsList = this.getOperatorsAt(period);
		return this.__flattenContext(operatorsList);
	}

	calculate() {
		var numberOfPeriods = this.__baseContext.getEffTerm();

		var summaryList = [],
			summaryItem,
			previousSummaryItem;

		for (var currentPeriod = 1; currentPeriod <= numberOfPeriods; currentPeriod++) {
			if (currentPeriod > 1) {
				previousSummaryItem = summaryList[summaryList.length - 1];
			}

			// Assign the `previous principal final balance` from the summary, 
			// Use the loan principal amount instead if it's the first period (ie. no previous summary)
			var previousPrincipalFinalBalance = previousSummaryItem ?
				previousSummaryItem.principalFinalBalance : this.__baseContext.principal;

			// Select the current context
			// It will take all active operators in account
			var currentContext = this.getContextAt(currentPeriod);

			// Calculate repayment amount (ie. pmt)
			var interestRate = currentContext.getEffInterestRate(),
				numberOfPeriodsLeft = numberOfPeriods - currentPeriod + 1;

			var pmt = Financial.pmt(
				previousPrincipalFinalBalance,
				interestRate, numberOfPeriodsLeft
			);

			// Create summary item
			summaryItem = new LoanSummaryItem(currentPeriod);
			summaryItem.principalInitialBalance = previousPrincipalFinalBalance;
			summaryItem.pmt = pmt;
			summaryItem.interestPaid = summaryItem.principalInitialBalance * interestRate;
			summaryItem.principalPaid = summaryItem.pmt - summaryItem.interestPaid;
			summaryItem.principalFinalBalance = summaryItem.principalInitialBalance - summaryItem.principalPaid;
			summaryList.push(summaryItem);
		}

		// Sum totals
		var totals = summaryList.reduce(function(previous, current) {
			return {
				pmt: previous.pmt + current.pmt,
				interestPaid: previous.interestPaid + current.interestPaid
			};
		});

		return {
			summaryList,
			totals
		};
	}
}

module.exports = LoanCalculatorEngine;