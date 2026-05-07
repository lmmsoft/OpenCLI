import { ArgumentError, AuthRequiredError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';
import http from 'node:http';
import https from 'node:https';

export const HKPL_DOMAIN = 'www.hkpl.gov.hk';
export const HKPL_WEBCAT_DOMAIN = 'webcat.hkpl.gov.hk';

const WEB_BASE = `https://${HKPL_DOMAIN}`;
const WEBCAT_BASE = `https://${HKPL_WEBCAT_DOMAIN}`;
const ACCOUNT_URL = `${WEBCAT_BASE}/wicket/bookmarkable/com.vtls.chamo.webapp.component.patron.PatronAccountPage?theme=WEB&locale=zh_TW`;
const LOGIN_POST_URL = `${WEB_BASE}/iw/login.php`;

export function resolveCredentials(args) {
    const username = String(args.username || process.env.HKPL_USERNAME || '').trim();
    const password = String(args.password || process.env.HKPL_PASSWORD || '');
    if (!username) {
        throw new ArgumentError('HKPL username is required', 'Pass --username or set HKPL_USERNAME.');
    }
    if (!password) {
        throw new ArgumentError('HKPL password is required', 'Pass --password or set HKPL_PASSWORD.');
    }
    return { username, password };
}

export function parseDueWithinDays(value, defaultValue = 3) {
    const raw = value ?? defaultValue;
    const days = Number(raw);
    if (!Number.isInteger(days) || days < 0 || days > 365) {
        throw new ArgumentError('due-within-days must be an integer between 0 and 365');
    }
    return days;
}

export function addDays(date, days) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

export function formatDate(date) {
    return date.toISOString().slice(0, 10);
}

export function todayHongKong() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Hong_Kong',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value;
    return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00.000Z`);
}

export function decodeHtml(value) {
    return String(value || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripTags(value) {
    return decodeHtml(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function sanitizeItemId(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/(?:chamo:)?(\d{3,})/);
    if (!match) {
        throw new ArgumentError('HKPL item id must be numeric or chamo:<id>', 'Example: opencli hkpl detail 3243877');
    }
    return match[1];
}

export function buildItemUrl(itemId) {
    return `${WEBCAT_BASE}/lib/item?id=chamo:${encodeURIComponent(itemId)}&theme=WEB&locale=zh_TW`;
}

function splitSetCookieHeader(header) {
    if (!header) return [];
    return String(header).split(/,(?=\s*[^;,=\s]+=[^;,]*)/g).map((part) => part.trim()).filter(Boolean);
}

class CookieJar {
    constructor() {
        this.cookies = new Map();
    }

    setFromHeaders(headers) {
        const values = Array.isArray(headers)
            ? headers
            : typeof headers.getSetCookie === 'function'
            ? headers.getSetCookie()
            : splitSetCookieHeader(headers.get('set-cookie'));
        for (const value of values) {
            const pair = String(value).split(';', 1)[0];
            const eq = pair.indexOf('=');
            if (eq <= 0) continue;
            this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
        }
    }

    header() {
        return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
    }
}

async function request(jar, url, options = {}, redirectCount = 0) {
    if (redirectCount > 15) {
        throw new CommandExecutionError('HKPL request exceeded redirect limit', url);
    }
    const headers = new Headers(options.headers || {});
    const cookie = jar.header();
    if (cookie) headers.set('Cookie', cookie);
    if (!headers.has('User-Agent')) {
        headers.set('User-Agent', 'Mozilla/5.0 OpenCLI HKPL adapter');
    }
    if (!headers.has('Accept')) {
        headers.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    }
    headers.set('Accept-Encoding', 'identity');

    const response = await nodeRequest(url, { ...options, headers });
    jar.setFromHeaders(response.headers['set-cookie'] || []);

    if (response.status >= 300 && response.status < 400) {
        const location = response.headers.location;
        if (!location) return response;
        const nextUrl = new URL(location.replace(/^HTTP:/, 'http:'), url).href.replace(/^http:\/\/webcat\./, 'https://webcat.');
        const method = response.status === 307 || response.status === 308 ? options.method : 'GET';
        return request(jar, nextUrl, { method, headers: options.headers }, redirectCount + 1);
    }

    return response;
}

async function readTextResponse(response, label) {
    const text = response.body;
    if (!response.ok) {
        throw new CommandExecutionError(`HKPL ${label} returned HTTP ${response.status}`, stripTags(text).slice(0, 240));
    }
    return text;
}

function nodeRequest(url, options = {}) {
    const parsed = new URL(url);
    const body = options.body ? Buffer.from(String(options.body)) : null;
    const headerEntries = options.headers instanceof Headers
        ? Object.fromEntries(options.headers.entries())
        : { ...(options.headers || {}) };
    if (body && !headerEntries['content-length']) {
        headerEntries['content-length'] = String(body.length);
    }

    const client = parsed.protocol === 'http:' ? http : https;
    return new Promise((resolve, reject) => {
        const req = client.request({
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port || undefined,
            path: `${parsed.pathname}${parsed.search}`,
            method: options.method || 'GET',
            headers: headerEntries,
            insecureHTTPParser: true,
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                resolve({
                    status: res.statusCode || 0,
                    ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
                    headers: res.headers,
                    body: Buffer.concat(chunks).toString('utf8'),
                });
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

function extractInputValue(html, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = html.match(new RegExp(`<input[^>]*name=["']${escaped}["'][^>]*value=["']([^"']*)["']`, 'i'));
    return match ? decodeHtml(match[1]) : '';
}

function extractLoginFields(html) {
    return {
        smagentname: extractInputValue(html, 'smagentname'),
        target: extractInputValue(html, 'target') || '/auth/login?target=/',
        lang: extractInputValue(html, 'lang') || 'tc',
        chamo: extractInputValue(html, 'chamo'),
        entryPage: extractInputValue(html, 'entryPage') || '/tc/login.php',
        queryString: extractInputValue(html, 'queryString'),
        pwExpiryAction: extractInputValue(html, 'pwExpiryAction'),
        noPwExpiryAlert: extractInputValue(html, 'noPwExpiryAlert'),
    };
}

async function submitAutoFormIfPresent(jar, html, baseUrl) {
    if (!html.includes('SMPostPreserve') && !html.includes('NAME="AUTOSUBMIT"')) return html;
    const actionMatch = html.match(/<form[^>]*action=["']([^"']+)["'][^>]*>/i);
    if (!actionMatch) return html;
    const body = new URLSearchParams();
    for (const match of html.matchAll(/<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["'][^>]*>/gi)) {
        body.append(decodeHtml(match[1]), decodeHtml(match[2]));
    }
    const response = await request(jar, new URL(decodeHtml(actionMatch[1]), baseUrl).href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    return readTextResponse(response, 'auto-submit');
}

export async function createAuthenticatedSession(args) {
    const { username, password } = resolveCredentials(args);
    const jar = new CookieJar();
    const first = await request(jar, ACCOUNT_URL);
    const loginHtml = await readTextResponse(first, 'login page');
    const fields = extractLoginFields(loginHtml);

    const body = new URLSearchParams();
    body.set('USER', username);
    body.set('PASSWORD', password);
    for (const [key, value] of Object.entries(fields)) body.set(key, value || '');

    const loginResponse = await request(jar, LOGIN_POST_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Origin: WEB_BASE,
            Referer: `${WEB_BASE}/tc/login.html`,
        },
        body,
    });
    const loginResult = await readTextResponse(loginResponse, 'login');
    if (loginResult.includes('ERR-SSO-0001')) {
        throw new AuthRequiredError(HKPL_DOMAIN, 'HKPL rejected the username or password.');
    }

    return { jar };
}

export async function fetchAccountHtml(session) {
    const response = await request(session.jar, ACCOUNT_URL);
    let html = await readTextResponse(response, 'account page');
    html = await submitAutoFormIfPresent(session.jar, html, ACCOUNT_URL);
    if (html.includes('登入我的帳戶') || html.includes('ERR-SSO-0001')) {
        throw new AuthRequiredError(HKPL_DOMAIN, 'HKPL account page requires login.');
    }
    if (!html.includes('借出項目')) {
        throw new EmptyResultError('hkpl loans', 'Could not find the borrowed-items tab on HKPL account page.');
    }
    return html;
}

export function parsePatronName(html) {
    const match = html.match(/<h1[^>]*class=["'][^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
    return match ? stripTags(match[1]) : '';
}

export function parseCheckoutHistoryStatus(html) {
    const match = html.match(/id=["']patron\.maintainCheckoutHistory["'][^>]*>([\s\S]*?)<\/label>/i);
    const value = match ? stripTags(match[1]) : '';
    const enabled = value === '是' || /^yes$/i.test(value);
    return {
        enabled,
        value,
        message: enabled
            ? 'HKPL account says checkout history is enabled, but this adapter has not found a returned-items table in the current account page.'
            : 'HKPL account setting "儲存借還記錄 (最多12個月)" is disabled, so returned-item history is not available from the account page.',
    };
}

export function parseCheckoutHistoryRows(html) {
    const headerIndex = html.indexOf('執行日期 / 時間');
    if (headerIndex < 0) return [];
    const endIndex = html.indexOf('CSV 格式', headerIndex);
    const sourceHtml = html.slice(headerIndex, endIndex > headerIndex ? endIndex : undefined);
    const rows = [];
    const rowRe = /<tr class=["'](?:odd|even)["'][^>]*>([\s\S]*?)<\/tr>/gi;
    let index = 0;
    for (const rowMatch of sourceHtml.matchAll(rowRe)) {
        const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
        if (cells.length < 8) continue;
        const titleMatch = cells[1].match(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
        const itemUrl = titleMatch ? new URL(decodeHtml(titleMatch[1]), WEBCAT_BASE + '/lib/item').href : '';
        const itemId = itemUrl.match(/chamo:(\d+)/)?.[1] || '';
        index += 1;
        rows.push({
            index,
            actionAt: stripTags(cells[0]),
            title: titleMatch ? stripTags(titleMatch[2]) : stripTags(cells[1]),
            action: stripTags(cells[2]),
            barcode: stripTags(cells[3]),
            reference: stripTags(cells[4]),
            location: stripTags(cells[5]),
            channel: stripTags(cells[6]),
            renewCount: stripTags(cells[7]) || '',
            itemId,
            itemUrl,
        });
    }
    return rows;
}

export function parseLoans(html) {
    const renewalForm = html.match(/<form id=["'][^"']+["'] method=["']post["'] action=["'][^"']*renewalForm[^"']*["'][^>]*>([\s\S]*?)<\/form>/i);
    const sourceHtml = renewalForm ? renewalForm[1] : html;
    const rows = [];
    const rowRe = /<tr class=["'](?:odd|even)["'][^>]*>([\s\S]*?)<\/tr>/gi;
    let index = 0;
    for (const rowMatch of sourceHtml.matchAll(rowRe)) {
        const rowHtml = rowMatch[1];
        const checkbox = rowHtml.match(/<input[^>]*name=["']renewalCheckboxGroup["'][^>]*value=["']([^"']+)["'][^>]*>/i);
        const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
        if (cells.length < 6) continue;
        const titleMatch = cells[1].match(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
        const itemUrl = titleMatch ? new URL(decodeHtml(titleMatch[1]), WEBCAT_BASE + '/lib/item').href : '';
        const itemId = itemUrl.match(/chamo:(\d+)/)?.[1] || '';
        const renewText = stripTags(cells[5]);
        const selectionText = stripTags(cells[0]);
        const renewMatch = renewText.match(/(\d+)\s*\([^0-9]*(\d+)/);
        index += 1;
        rows.push({
            index,
            itemId,
            title: titleMatch ? stripTags(titleMatch[2]) : stripTags(cells[1]),
            barcode: stripTags(cells[3]),
            dueDate: stripTags(cells[4]),
            renewCount: renewMatch ? Number(renewMatch[1]) : null,
            renewLimit: renewMatch ? Number(renewMatch[2]) : null,
            renewable: checkbox ? 'yes' : 'no',
            selectValue: checkbox ? decodeHtml(checkbox[1]) : selectionText,
            itemUrl,
        });
    }
    return rows;
}

export async function fetchItemHtml(itemIdOrUrl) {
    const itemId = sanitizeItemId(itemIdOrUrl);
    const jar = new CookieJar();
    const response = await request(jar, buildItemUrl(itemId));
    const html = await readTextResponse(response, 'item detail');
    if (!html.includes('資料細項') && !html.includes('itemFields')) {
        throw new EmptyResultError('hkpl detail', `HKPL item ${itemId} did not return a readable detail page.`);
    }
    return { itemId, url: buildItemUrl(itemId), html };
}

export function parseItemDetail(itemId, url, html) {
    const title = stripTags(html.match(/<h1[^>]*class=["']title["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
    const author = stripTags(html.match(/<a[^>]*class=["']author["'][^>]*>([\s\S]*?)<\/a>/i)?.[1] || '');
    const coverImageUrl = decodeHtml(html.match(/<div[^>]*id=["']bibliographicImage["'][\s\S]*?<img[^>]*src=["']([^"']+)["']/i)?.[1] || '');
    const fields = {};
    for (const match of html.matchAll(/<td class=["']label["'][^>]*>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>/gi)) {
        const label = stripTags(match[1]);
        const value = stripTags(match[2]);
        if (label) fields[label] = value;
    }
    return {
        itemId,
        title,
        author: fields['著者'] || author,
        callNumber: fields['索書號'] || '',
        publisher: fields['出版者'] || '',
        publicationYear: fields['出版年份'] || '',
        isbn: fields['標準號碼'] || '',
        language: fields['語言'] || '',
        subject: fields['主題'] || '',
        notes: fields['附註'] || '',
        coverImageUrl,
        url,
    };
}

export function getCoverExtension(url) {
    const pathname = new URL(url).pathname;
    const ext = pathname.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase();
    if (ext === '.gif' || ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp') return ext;
    return '.gif';
}

function extractRenewalForm(html) {
    const match = html.match(/<form id=["']([^"']+)["'] method=["']post["'] action=["']([^"']*renewalForm[^"']*)["'][^>]*>/i);
    if (!match) {
        throw new EmptyResultError('hkpl renew', 'Could not find HKPL renewal form.');
    }
    return { formId: match[1], action: decodeHtml(match[2]) };
}

function buildWicketPageUrl(relativeAction, accountHtml) {
    const baseMatch = accountHtml.match(/Wicket\.Ajax\.baseUrl=["']([^"']+)["']/);
    const baseUrl = baseMatch
        ? `${WEBCAT_BASE}/${decodeHtml(baseMatch[1])}`
        : ACCOUNT_URL;
    return new URL(relativeAction, baseUrl).href;
}

export function selectRenewableLoans(loans, dueWithinDays) {
    const cutoff = formatDate(addDays(todayHongKong(), dueWithinDays));
    return loans.filter((loan) => loan.renewable === 'yes' && loan.dueDate && loan.dueDate <= cutoff);
}

export async function renewLoans(session, accountHtml, loansToRenew) {
    if (loansToRenew.length === 0) {
        return { reference: '', successCount: 0, rows: [] };
    }

    const form = extractRenewalForm(accountHtml);
    const body = new URLSearchParams();
    body.set(`${form.formId}_hf_0`, '');
    body.set('renewalCheckboxGroup:checkoutsTable:topToolbars:toolbars:1:span:pageSize:sizeChoice', '0');
    for (const loan of loansToRenew) body.append('renewalCheckboxGroup', loan.selectValue);
    body.set('renewalCheckboxGroup:checkoutsTable:bottomToolbars:toolbars:2:span:pageSize:sizeChoice', '0');

    const url = buildWicketPageUrl(form.action, accountHtml);
    const response = await request(session.jar, url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Origin: WEBCAT_BASE,
            Referer: ACCOUNT_URL,
        },
        body,
    });
    const html = await readTextResponse(response, 'renew');
    if (html.includes('找不到頁面')) {
        throw new CommandExecutionError('HKPL renewal form target returned not found', 'The Wicket page sequence may have changed. Re-fetch the account page and retry.');
    }
    if (!html.includes('續借結果')) {
        throw new CommandExecutionError('HKPL renewal did not return a renewal result page', stripTags(html).slice(0, 240));
    }

    const reference = stripTags(html.match(/參考編號：\s*([^<(]+)/)?.[1] || '');
    const countMatch = stripTags(html.match(/<h2>([\s\S]*?)<\/h2>/i)?.[1] || '').match(/(\d+)項館藏續借成功/);
    const successCount = countMatch ? Number(countMatch[1]) : 0;
    const rows = parseRenewResultRows(html);
    return { reference, successCount, rows };
}

function parseRenewResultRows(html) {
    const rows = [];
    const rowRe = /<tr class=["'](?:odd|even)["'][^>]*>([\s\S]*?)<\/tr>/gi;
    for (const rowMatch of html.matchAll(rowRe)) {
        const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
        if (cells.length < 5) continue;
        const titleMatch = cells[0].match(/<a[^>]*>([\s\S]*?)<\/a>/i);
        rows.push({
            title: titleMatch ? stripTags(titleMatch[1]) : stripTags(cells[0]),
            barcode: stripTags(cells[2]),
            newDueDate: stripTags(cells[3]),
            status: stripTags(cells[4]),
        });
    }
    return rows;
}
