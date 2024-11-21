const fs = require('fs');

class Database {
    constructor() {
        this.serverList = require('./serverList.json');
        this.userList = require('./userList.json');
    }

    saveServerList() {
        fs.writeFileSync('./serverList.json', JSON.stringify(this.serverList, null, 4));
    }

    saveUserList() {
        fs.writeFileSync('./userList.json', JSON.stringify(this.userList, null, 4));
    }
}

module.exports = Database;
