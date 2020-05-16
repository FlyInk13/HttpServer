const querystring = require('querystring');
const { Server } = require('http');

class HttpServer {
  constructor({ maxConnections=300, ttl=30e3, contentSizeLimit=1e6 }) {
    this.max_connections = maxConnections;
    this.contentSizeLimit = contentSizeLimit;
    this.ttl = ttl;

    this.client_index = 0;
    this.client_count = 0;
    this.clients_list = {};

    this.onRequest = this.onRequest.bind(this);
    this.clearConnect = this.clearConnect.bind(this);
    this.onConnection = this.onConnection.bind(this);
    this.onPayload = this.onPayload.bind(this);
    this.validateRequest = this.validateRequest.bind(this);
    this.expireClientFilter = this.expireClientFilter.bind(this);
  }

  expireClientFilter(client) {
    const live_time = Date.now() - client.created;
    return live_time < this.ttl;
  }

  listen(port) {
    return new Promise((resolve, reject) => {
      this.httpServer = Server(this.onRequest);

      this.httpServer.listen(port, (error) => {
        if (typeof error !== 'undefined') {
          reject(error)
        }

        this.interval = setInterval(this.clearConnect, 1000, this.expireClientFilter);
        this.httpServer.on('connection', this.onConnection);
        resolve();
      });
    });
  }

  onRequestEnd(req, res) {
    const printError = this.printError.bind(this, req, res);
    const printResponse = this.printResponse.bind(this, req, res);
    const onPayload = this.onPayload.bind(this, req, res);

    try {
      if (req.method === 'POST') {
        req.data = JSON.parse(req.body);
      } else {
        req.data = querystring.parse(req.body);
      }

      if (typeof req.data !== 'object') {
        // noinspection ExceptionCaughtLocallyJS
        throw {
          code: 400,
          description: 'Bad Request: Invalid payload type',
          type: typeof req.data
        }
      }

      req.wait = onPayload(req.data);
    } catch (error) {
      req.body = null;
      req.data = null;
      printError(error);
      return;
    }

    Promise.resolve()
      .then(() => req.wait)
      .then(printResponse)
      .catch(printError);
  }

  onRequestData(req, res, chunk) {
    req.body += chunk;
    chunk = null;

    if (req.body.length > this.contentSizeLimit) {
      req.body = null;
      res.close();
    }
  }

  onRequest(req, res) {
    res.created = Date.now();
    req.ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    req.host = req.headers.host;
    req.body = '';
    res.close = (message, code) => {
      if (!res.finished) {
        if (message) {
          res.writeHead(code || 500, {
            'Content-Type': 'text/html; charset=utf-8'
          });
          res.end(message);
        } else {
          req.connection.destroy();
        }
      }
      res = null;
      req = null;
    };

    try {
      this.validateRequest(req, res);
    } catch (error) {
      this.printError(req, res, error);
      return;
    }

    req.on('data', this.onRequestData.bind(this, req, res));
    req.on('end', this.onRequestEnd.bind(this, req, res));
  }

  onConnectionLimit(socket) {
    console.error('max_connections limit', this.client_count);
    socket.destroy();
    socket = null;
  }

  onConnection(socket) {
    if (this.client_count > this.max_connections) {
      this.onConnectionLimit(socket);
      return;
    }

    // todo: переписать client_index на uuid
    let loop_limit   = 1000;
    let client_index = 0;

    do {
      client_index = ++this.client_index;
      if (this.client_index > 2e9) this.client_index = 0;
    } while (this.clients_list[client_index] && loop_limit--);

    if (!loop_limit) {
      console.error('loop limit', socket);
      socket.destroy();
      socket = null;
      return;
    }

    this.clients_list[client_index] = socket;
    //

    socket.created = Date.now();
    this.client_count++;

    socket.on('close', () =>  {
      delete this.clients_list[client_index];
      socket = null;
      this.client_count--;
    });
  }

  clearConnect(filter) {
    for (const client_index in this.clients_list) {
      const client = this.clients_list[client_index];
      if (filter && filter(client)) {
        continue;
      }

      client.destroy();
      this.client_count--;
      delete this.clients_list[client_index];
    }
  }

  printResponse(req, res, response) {
    res.close(response, 200);
  }

  printError(req, res, error) {
    console.error(error);
    res.close('Server error', 500);
  }

  onPayload(req, res, data) {
    return 'OK';
  }

  validateRequest(req, res) {
    // if (...) throw
  }
}

module.exports = HttpServer;
