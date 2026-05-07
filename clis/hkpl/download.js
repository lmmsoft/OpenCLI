import * as fs from 'node:fs';
import * as path from 'node:path';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { httpDownload, sanitizeFilename } from '@jackwener/opencli/download';
import { formatBytes } from '@jackwener/opencli/download/progress';
import { EmptyResultError } from '@jackwener/opencli/errors';
import { HKPL_DOMAIN, fetchItemHtml, getCoverExtension, parseItemDetail } from './utils.js';

cli({
    site: 'hkpl',
    name: 'download',
    access: 'read',
    description: 'Download HKPL item cover image when available',
    domain: HKPL_DOMAIN,
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        { name: 'id', positional: true, required: true, help: 'HKPL item id, chamo:id, or item URL' },
        { name: 'output', default: './hkpl-downloads', help: 'Output directory' },
    ],
    columns: ['itemId', 'title', 'status', 'size', 'path', 'imageUrl'],
    func: async (args) => {
        const { itemId, url, html } = await fetchItemHtml(args.id);
        const detail = parseItemDetail(itemId, url, html);
        if (!detail.coverImageUrl) {
            throw new EmptyResultError('hkpl download', `No cover image was found for HKPL item ${itemId}.`);
        }
        const outputDir = String(args.output || './hkpl-downloads');
        fs.mkdirSync(outputDir, { recursive: true });
        const filename = `${itemId}_${sanitizeFilename(detail.title || 'cover', 80)}${getCoverExtension(detail.coverImageUrl)}`;
        const destPath = path.join(outputDir, filename);
        const result = await httpDownload(detail.coverImageUrl, destPath, {
            headers: { Referer: detail.url },
            timeout: 60000,
        });
        return [{
            itemId,
            title: detail.title,
            status: result.success ? 'success' : 'failed',
            size: result.success ? formatBytes(result.size) : (result.error || 'unknown error'),
            path: destPath,
            imageUrl: detail.coverImageUrl,
        }];
    },
});
