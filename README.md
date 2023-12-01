# rethym-server
Server for the Rethym: the libre audio streaming server.

## Requirements
Rethym Server requires at least:
* The LTS version of NodeJS
* MySQL or MariaDB 8.0 or newer

## Kinks and issues
* Plugins are not currently supported
* Accounts are also currently unsupported

## Compatible clients
* The Rethym Web Client is currently under works

## Setup
To setup the Rethym server software, you need to:
1. Run `git clone https://github.com/rethym/rethym-server.git` in the desired folder
2. Run `npm ci` to install the dependencies (this command is required after every update)
3. Run `node .` to start the server
4. Go to http://localhost:25523/setup to configure the server
5. Follow the instructions listed on that webpage and remember to disable `enable-setup` in config.json and restart your server
6. You can now move your audio files to /rethym/[account name], download a compatible client and start listening to your favourite tracks!

## Updating
There is not currently an auto-updater or update notifier for this software.

## Support Rethym
At this time, I am not accepting tips, donations or monetary gifts for this project. If you would like to support Rethym, please consider starring this repo and/or sharing it with friends.
