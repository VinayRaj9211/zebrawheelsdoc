# Zebra Wheels rate list

A private rate-list desk for Zebra Wheels Travels. Sign in, read the latest file, open any older update, and download a PDF. Only the latest file can be edited. Download and edit both ask for a passcode.

The passcode and the sign-in password live outside this folder, in `C:\xampp\zwdoc-secrets\.env`, so Apache cannot serve them.

## Run on this computer

```bat
npm install
npm start
```

Or double-click `start.bat`. The app picks port 8787, or the next free port if that one is busy. Open the address printed in the window.

Do not open this folder through XAMPP (`http://localhost/zwdoc`). Apache is blocked from serving it on purpose.

Saved updates are stored in `data/documents.json`.

## Phone on the same Wi-Fi

Use the `On this Wi-Fi` address printed when the app starts. The computer has to stay on.

## Fonts

The PDF uses a subset of [Noto Sans](https://fonts.google.com/noto/specimen/Noto+Sans), licensed under the SIL Open Font License.
