# Pocket Cart

A shopping calculator for Android (Expo / React Native) that stores your cart in a local SQLite database.

## Features
- Keypad price entry with quantity, Add To / Remove From cart
- Remove a product (full or partial quantity)
- New shopping session, and history of the last finished one

## Run
```
npm install
npx expo start
```
Open in Expo Go on your phone.

## Build an APK
```
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```
The GitHub Action in `.github/workflows` does the same; add an `EXPO_TOKEN` secret to the repo first.

## Database
`sessions` (one row per shopping trip) and `items` (price, quantity per session) in `shopping.db`.
