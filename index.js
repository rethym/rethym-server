const fs = require("fs");
const chalk = require("chalk");
const asciify = require("asciify-image");
const express = require("express");
const { setTimeout } = require("timers/promises");
const path = require("path");
const bodyParser = require('body-parser');
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const NodeID3 = require('node-id3');
const mime = require('mime-types');
JSON.minify = require("./json.minify.js");

const app = express();

const config = JSON.parse(JSON.minify(fs.readFileSync("config/config.json").toString()));
const dbconfig = JSON.parse(fs.readFileSync("config/database.json")) == null ? {"mysqlHost":"","mysqlDB":"","mysqlUser":"","mysqlPass":""} : JSON.parse(fs.readFileSync("config/database.json"));

const serverport = config["port"];
const saltRounds = 10;

function displayImage(o){asciify(o,{fit:"box",width:50},(o,r)=>{o?console.error("Error converting image to ASCII:",o):console.log(r)})}

if(config["show-splash-image"]) {
  displayImage("./img/rethym-logo-sm.png"); // display Rethym image
}

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// regular routes are in /webui/
app.set('views', './webui');
app.set('view engine', 'ejs');

app.get('/', (req, res) => { res.render('index', { title: 'Rethym' }); });
app.get('/admin', (req, res) => { if(!config["enable-setup"]) {res.render('admin', { title: 'Admin Panel' });} else { res.redirect("/setup"); } });

// setup page with toggle in config.json
app.get('/setup', (req, res) => { if(config["enable-setup"]) {res.render('setup', { title: 'Rethym Setup', config: config });} });

// assets
app.use('/web-assets', express.static(path.join(__dirname, 'assets')));
app.use('/web-assets/img', express.static(path.join(__dirname, 'img')));

// api routes are below
app.get('/api', (req, res) => {
  res.json({"status":1});
})

app.post('/api', (req, res) => {
  res.json({"status":1});
})

app.post('/api/setup', (req, res) => {
  const postData = req.body;

  if(!config["enable-setup"]) {
    res.json({ "status": 0, "tip": "Try enabling setup." });
    return;
  }

  if (
    postData["mysqlHost"] == null ||
    postData["mysqlUser"] == null ||
    postData["mysqlDB"] == null ||
    postData["accUsername"] == null ||
    postData["accPassword"] == null
  ) {
    res.json({ "status": 0 });
    return;
  }

  const mysqlConn = mysql.createConnection({
    host: postData["mysqlHost"],
    user: postData["mysqlUser"],
    password: postData["mysqlPass"] != null ? postData["mysqlPass"] : "",
    database: postData["mysqlDB"],
  });

  mysqlConn.connect((err) => {
    if (err) {
      console.error({ "status": 0, "tip": "Wrong credentials to the database?" });
      res.json({ "status": 0, "tip": "Wrong credentials to the database?" });
      return;
    }

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        isAdmin BOOLEAN DEFAULT false,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    mysqlConn.query(createTableQuery, (error, results, fields) => {
      if (error) {
        console.error('Error creating table:', error);
        res.json({ "status": 0, "tip": "Table error" });
        mysqlConn.end();
        return;
      }

      bcrypt.hash(postData["accPassword"], saltRounds, (err, hash) => {
        if (err) {
          console.error('Error hashing password:', err);
          res.json({ "status": 0, "tip": "Error hashing password" });
          mysqlConn.end();
          return;
        }

        const newUser = {
          username: postData["accUsername"],
          isAdmin: true,
          password: hash,
        };

        const insertUserQuery = 'INSERT INTO users SET ?';

        mysqlConn.query(insertUserQuery, newUser, (error, results, fields) => {
          if (error) {
            console.error('Error inserting new user:', error);
            res.json({ "status": 0, "tip": "Error inserting new user" });
          } else {
            // Save the JSON data to a file
            const jsonData = {
              mysqlHost: postData["mysqlHost"],
              mysqlUser: postData["mysqlUser"],
              mysqlPass: postData["mysqlPass"] != null ? postData["mysqlPass"] : "",
              mysqlDB: postData["mysqlDB"]
            };

            fs.writeFile(config["mysql-server-info"], JSON.stringify(jsonData), (err) => {
              if (err) {
                console.error('Error writing JSON file:', err);
                res.json({ "status": 0, "tip": "Error writing JSON file" });
              } else {
                registerNewUser(postData["accUsername"]);
                res.json({ "status": 1 });
              }
            });
          }

          mysqlConn.end();
        });
      });
    });
  });
});

app.post('/api/songs', async (req, res) => {
  const postData = req.body;
  if (postData["accUsername"] == null || postData["accPassword"] == null) {
    res.json({ "status": 0 });
    return;
  }

  if(await checkUserAccess(postData["accUsername"], postData["accPassword"])) {
    const audioFilesInfo = getAudioFilesInfo(config["file-path"] + "/" + postData["accUsername"]);
    res.json(audioFilesInfo);
  } else {
    res.json({"status":0,"tip":"Authentication"});
  }
})

app.post('/api/song-playback-data', async (req, res) => {
  const postData = req.body;
  if (postData["songName"] == null || postData["accUsername"] == null || postData["accPassword"] == null) {
    res.json({ "status": 0 });
    return;
  }

  if(await checkUserAccess(postData["accUsername"], postData["accPassword"])) {
    const audioFileLocation = config["file-path"] + "/" + postData["accUsername"] + "/" + postData["songName"].replace("..", "");
    if(readFileAsBase64(audioFileLocation) != null) {
      res.json({"status": 1, "mimetype": mime.lookup(audioFileLocation), "b64": readFileAsBase64(audioFileLocation)});
    } else {
      res.json({"status":0,"tip":"File"});
    }
  } else {
    res.json({"status":0,"tip":"Authentication"});
  }
});

app.post('/api/currently-playing-info', async (req, res) => {
  if(true) {}
})

app.post('/api/set-playing', async (req, res) => {
  const postData = req.body;
  if (postData["songName"] == null || postData["accUsername"] == null || postData["accPassword"] == null) {
    res.json({ "status": 0 });
    return;
  }

  startTime = Date.now();

  if(await checkUserAccess(postData["accUsername"], postData["accPassword"])) {
    const audioFileLocation = config["file-path"] + "/" + postData["accUsername"] + "/" + postData["songName"].replace("..", "");
    if(readFileAsBase64(audioFileLocation) != null) {
      const responseoutput = ({"status": 1, "mimetype": mime.lookup(audioFileLocation), "b64": readFileAsBase64(audioFileLocation), "startTime": startTime, "songInfo": getAudioFilesInfo(config["file-path"] + "/" + postData["accUsername"], postData["songName"]) });
      console.log(responseoutput);
      res.json(responseoutput);
    } else {
      res.json({"status":0,"tip":"File"});
    }
  } else {
    res.json({"status":0,"tip":"Authentication"});
  }
});

async function startServer() {
  await setTimeout(100); // wait for splash image

  if(config["enable-setup"]) {
    console.log(chalk.cyan("INFO") + " Setup is required. Go to http://localhost:" + serverport + "/setup to complete setup.");
  }

  app.listen(serverport, async () => {
    console.log(`Rethym server starting on ${serverport}`)
  })
}

startServer();

function registerNewUser(a) {
  const invalidCharacters = ['/', '\\', '?', '%', '*', ':', '|', '"', '<', '>', '.', ' '];

  directoryPath = config["file-path"];
  if (!fs.existsSync(directoryPath)) {
    // Directory doesn't exist, create it
    fs.mkdirSync(directoryPath);
    console.log('Directory created:', directoryPath);
  } else {
    console.log('Directory already exists:', directoryPath);
  }

  userDirectoryPath = config["file-path"] + "/" + (a.replace(new RegExp(`[${invalidCharacters.join('')}]`, 'g'), ''));
  if (userDirectoryPath != config["file-path"] && !fs.existsSync(userDirectoryPath)) {
    // Directory doesn't exist, create it
    fs.mkdirSync(userDirectoryPath);
    console.log('Directory created:', userDirectoryPath);
  } else {
    console.log('Directory already exists:', userDirectoryPath);
    return false;
  }
}

async function checkUserAccess(username, password) {
  return new Promise((resolve) => {
    const mysqlConn = mysql.createConnection({
      host: dbconfig["mysqlHost"],
      user: dbconfig["mysqlUser"],
      password: dbconfig["mysqlPass"] != null ? dbconfig["mysqlPass"] : "",
      database: dbconfig["mysqlDB"],
    });

    const getUserQuery = 'SELECT * FROM users WHERE username = ?';

    mysqlConn.query(getUserQuery, [username], async function (error, results, fields) {
      if (error) {
        console.error('Error retrieving user:', error);
        resolve(false);
        return;
      }

      if (results.length === 0) {
        resolve(false);
        return;
      }

      const storedHashedPassword = results[0].password;

      try {
        const result = await bcrypt.compare(password, storedHashedPassword);
        resolve(result);
      } catch (err) {
        console.error('Error comparing passwords:', err);
        resolve(false);
      }
    });
  });
}

function getAudioFilesInfo(directoryPath, fileName = null) {
  const audioFilesInfo = [];

  // Read files in the directory
  const files = fs.readdirSync(directoryPath);

  files.forEach((file) => {
    const filePath = path.join(directoryPath, file);

    if(fileName == null || fileName == file) {
      // Check if it's a file
      if (fs.statSync(filePath).isFile()) {
        // Check if it's an audio file (you may need to adjust the file extensions)
        if (['.mp3', '.ogg', '.flac', '.wav'].includes(path.extname(filePath).toLowerCase())) {
          const tags = NodeID3.read(filePath);

          // Add file info to the array
          audioFilesInfo.push({
            fileName: file,
            title: tags.title || file || 'Unknown',
            subtitle: tags.subtitle || 'Unknown',
            artist: tags.artist || 'Unknown',
            publisher: tags.publisher || 'Unknown',
            album: tags.album || 'Unknown',
            genre: tags.genre || 'Unknown',
            copyright: tags.copyright || 'Unknown',
            date: tags.date || 'Unknown',
            recordingTime: tags.recordingTime || 'Unknown',
            releaseTime: tags.releaseTime || 'Unknown',
            year: tags.year || 'Unknown',
            fileType: tags.fileType || 'Unknown',
            size: tags.size || 'Unknown',
            length: tags.length || -1,
            image: tags.image || null
          });
        }
      }
    }
  });

  return audioFilesInfo;
}

function readFileAsBase64(filePath) {
  try {
    // Check if file exists
    if (fs.existsSync(filePath)) {
      // Read file content
      const fileBuffer = fs.readFileSync(filePath);

      // Convert the Buffer to a base64 string
      const base64Data = fileBuffer.toString('base64');

      return base64Data;
    } else {
      return null;
    }
  } catch (error) {
    console.error(`Error reading file: ${error.message}`);
    return null;
  }
}
