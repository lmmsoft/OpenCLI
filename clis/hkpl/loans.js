import { cli, Strategy } from '@jackwener/opencli/registry';
import { EmptyResultError } from '@jackwener/opencli/errors';
import { HKPL_DOMAIN, createAuthenticatedSession, fetchAccountHtml, parseLoans } from './utils.js';

cli({
    site: 'hkpl',
    name: 'loans',
    access: 'read',
    description: 'List borrowed items from a Hong Kong Public Libraries account',
    domain: HKPL_DOMAIN,
    strategy: Strategy.COOKIE,
    browser: false,
    args: [
        { name: 'username', help: 'HKPL account number; can also use HKPL_USERNAME' },
        { name: 'password', help: 'HKPL password; can also use HKPL_PASSWORD' },
    ],
    columns: ['index', 'title', 'barcode', 'dueDate', 'renewCount', 'renewLimit', 'renewable', 'selectValue'],
    func: async (args) => {
        const session = await createAuthenticatedSession(args);
        const html = await fetchAccountHtml(session);
        const loans = parseLoans(html);
        if (loans.length === 0) {
            throw new EmptyResultError('hkpl loans', 'No borrowed items were found on the HKPL account page.');
        }
        return loans;
    },
});
