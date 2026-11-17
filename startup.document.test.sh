#!/usr/bin/env bash
set -e

/opt/wait-for-it.sh mongo:27017
/opt/wait-for-it.sh redis:6379
npm install
npm run start:dev
