
Building
```
npm run build
```
Pushing as usual:
```
git add .
git commit -m "..."
git push
```
Patch
```
npm version patch
```

`npm version` syncs the version and Zotero compatibility range in `manifest.json` from `package.json`.
The release workflow uses the same script to generate `updates.json`.
