# HKPL Adapter

Commands for Hong Kong Public Libraries account and catalog workflows.

## Credentials

`login`, `loans`, `history`, and `renew` accept credentials as command options or environment variables:

```bash
HKPL_USERNAME='...' HKPL_PASSWORD='...' opencli hkpl loans
opencli hkpl renew --username '...' --password '...'
```

Do not commit real card numbers or passwords. For scheduled jobs, prefer environment variables or a local private config file.

## Commands

- `opencli hkpl login`: verify account login and show the patron name.
- `opencli hkpl loans`: list currently borrowed items, including item id, barcode, due date, renewal counts, and item URL.
- `opencli hkpl renew`: renew items due within `--due-within-days` days, default 3. Use `--dry-run` to preview.
- `opencli hkpl history`: list returned-item checkout history rows when the account has "儲存借還記錄 (最多12個月)" enabled.
- `opencli hkpl detail <itemId>`: fetch bibliographic details such as title, author, call number, publisher, year, ISBN, language, subject, and cover URL.
- `opencli hkpl download <itemId>`: download the cover image when HKPL/Syndetics provides one.

## Notes

HKPL's account page does not show original borrow dates in the current loans table. It shows due dates and renewal counts. Returned-item history only appears after the checkout-history setting is enabled; HKPL may not backfill rows from before that setting was turned on.
