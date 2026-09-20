window.PAYMENT_CONFIG = {
    currency: 'VES',
    exchangeRate: 849.564,
    exchangeRates: {
        COP: 4000,
        VES: 849.564
    },
    ratesApiUrl: 'https://open.er-api.com/v6/latest/USD',
    ratesRefreshMs: 5 * 60 * 1000,
    paymentMethods: {
        pagoMovil: {
            bank: 'Banco de Venezuela',
            bankCode: '0102',
            phone: '0426-2400644',
            identity: '33550719'
        },
        transferencia: {
            bank: 'Banco de Venezuela',
            bankCode: '0102',
            accountNumber: '01020157890000587976',
            identity: '33550719'
        }
    }
};
