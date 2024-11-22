const fs = require('fs');

class Database {
    constructor() {
        this.serverList = require('./serverList.json');
        this.userList = require('./userList.json');
    }

    saveServerList() {
        fs.writeFileSync('./serverList.json', JSON.stringify(this.serverList, null, 4));
    }

    readServerList() {
        this.serverList = require('./serverList.json');
    }

    saveUserList() {
        fs.writeFileSync('./userList.json', JSON.stringify(this.userList, null, 4));
    }

    readUserList() {
        this.userList = require('./userList.json');
    }
}

module.exports = Database;
