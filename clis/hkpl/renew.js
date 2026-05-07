import { cli, Strategy } from '@jackwener/opencli/registry';
import {
    HKPL_DOMAIN,
    createAuthenticatedSession,
    fetchAccountHtml,
    parseDueWithinDays,
    parseLoans,
    renewLoans,
    selectRenewableLoans,
} from './utils.js';

cli({
    site: 'hkpl',
    name: 'renew',
    access: 'write',
    description: 'Batch renew HKPL borrowed items due within N days',
    domain: HKPL_DOMAIN,
    strategy: Strategy.COOKIE,
    browser: false,
    args: [
        { name: 'username', help: 'HKPL account number; can also use HKPL_USERNAME' },
        { name: 'password', help: 'HKPL password; can also use HKPL_PASSWORD' },
        { name: 'due-within-days', type: 'int', default: 3, help: 'Renew items due within this many days (default: 3)' },
        { name: 'dry-run', type: 'boolean', default: false, help: 'Only list items that would be renewed' },
    ],
    columns: ['status', 'selectedCount', 'successCount', 'reference', 'title', 'barcode', 'newDueDate'],
    func: async (args) => {
        const dueWithinDays = parseDueWithinDays(args['due-within-days'], 3);
        const session = await createAuthenticatedSession(args);
        const html = await fetchAccountHtml(session);
        const selected = selectRenewableLoans(parseLoans(html), dueWithinDays);

        if (args['dry-run']) {
            if (selected.length === 0) {
                return [{ status: 'nothing_to_renew', selectedCount: 0, successCount: 0, reference: '', title: '', barcode: '', newDueDate: '' }];
            }
            return selected.map((loan) => ({
                status: 'dry_run',
                selectedCount: selected.length,
                successCount: 0,
                reference: '',
                title: loan.title,
                barcode: loan.barcode,
                newDueDate: loan.dueDate,
            }));
        }

        if (selected.length === 0) {
            return [{ status: 'nothing_to_renew', selectedCount: 0, successCount: 0, reference: '', title: '', barcode: '', newDueDate: '' }];
        }

        const result = await renewLoans(session, html, selected);
        return result.rows.map((row) => ({
            status: row.status || 'renewed',
            selectedCount: selected.length,
            successCount: result.successCount,
            reference: result.reference,
            title: row.title,
            barcode: row.barcode,
            newDueDate: row.newDueDate,
        }));
    },
});
