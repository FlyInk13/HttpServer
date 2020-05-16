# HttpServer
Простой сервер без зависимостей, который можно дополнять через наследования  

Пример использования:
```
class MyServer extends HttpServer {
  validateRequest(req, res) {
    // тут можно проводить любые проверки и выкидывать throw, для клиента
  }

  onPayload(req, res, payload) {
    // payload - объект из JSON в POST запросе или GET параметры
     
    // return Promise
    return {
      random: Math.random(),
    };
  }
  
  printResponse(req, res, response) {
    res.close(JSON.stringify({ response }), 200);
  }

  printError(req, res, error) {
    console.error(error);
    res.close(JSON.stringify({ error }), 200);
  }
}

const serverPort = 3000;
new AppVkAppsApiServer({
  maxConnections: 300,  // Максимальное количество одновременных клиентов
  ttl: 30e3,            // Максимальное время жизни сокета в секундах
  contentSizeLimit: 1e6 // Максимальный размер POST запроса
}).listen(serverPort).catch(console.error);
```
