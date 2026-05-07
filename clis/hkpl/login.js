import { cli, Strategy } from '@jackwener/opencli/registry';
import { HKPL_DOMAIN, createAuthenticatedSession, fetchAccountHtml, parsePatronName } from './utils.js';

cli({
    site: 'hkpl',
    name: 'login',
    access: 'read',
    description: 'Verify Hong Kong Public Libraries account login',
    domain: HKPL_DOMAIN,
    strategy: Strategy.COOKIE,
    browser: false,
    args: [
        { name: 'username', help: 'HKPL account number; can also use HKPL_USERNAME' },
        { name: 'password', help: 'HKPL password; can also use HKPL_PASSWORD' },
    ],
    columns: ['name', 'status'],
    func: async (args) => {
        const session = await createAuthenticatedSession(args);
        const html = await fetchAccountHtml(session);
        return [{ name: parsePatronName(html), status: 'logged_in' }];
    },
});
