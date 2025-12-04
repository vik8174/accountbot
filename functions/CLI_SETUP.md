# CLI Scripts Setup

## Authentication for Local CLI Scripts

CLI scripts (`add-account`, `list-accounts`) require authentication to access Firestore.

### Option 1: Service Account Key (Recommended for local development)

1. **Download service account key:**
   - Open Firebase Console: https://console.firebase.google.com/
   - Select your project (`accountbot-dev` or `accountbot-prod`)
   - Settings → Service Accounts
   - Click "Generate new private key"
   - Save the file as `serviceAccountKey.json` in the `functions/` directory

2. **Add file to `.gitignore`:**
   ```bash
   echo "serviceAccountKey.json" >> functions/.gitignore
   ```

3. **Run scripts:**
   ```bash
   cd functions
   npm run list-accounts
   npm run add-account
   ```

### Option 2: Google Cloud SDK (Application Default Credentials)

If you have Google Cloud SDK installed:

```bash
gcloud auth application-default login
```

After this, scripts will automatically find credentials.

## Using the Scripts

### List all accounts
```bash
npm run list-accounts
```

### Add a new account
```bash
npm run add-account
```

The script will prompt for:
- Account name (e.g., "Cash", "Visa Card")
- Slug (unique identifier, lowercase)
- Currency (EUR, USD, UAH)
- Initial balance (default: 0)

## Troubleshooting

### "Unable to detect a Project Id"

**Cause:** Missing credentials.

**Solution:**
1. Ensure `serviceAccountKey.json` exists in `functions/`
2. Or run `gcloud auth application-default login`

### "Failed to read credentials from file"

**Cause:** Invalid path to credentials.

**Solution:** Ensure service account key is located at `functions/serviceAccountKey.json`
