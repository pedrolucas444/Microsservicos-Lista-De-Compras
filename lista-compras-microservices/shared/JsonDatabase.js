const fs = require("fs");
const path = require("path");

class JsonDatabase {
  constructor(filename) {
    this.file = path.join(__dirname, filename);
    if (!fs.existsSync(this.file)) {
      fs.writeFileSync(this.file, JSON.stringify([]));
    }
  }

  read() {
    const data = fs.readFileSync(this.file);
    return JSON.parse(data);
  }

  write(data) {
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2));
  }
}

module.exports = JsonDatabase;