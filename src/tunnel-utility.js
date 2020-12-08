const { ipcMain } = require('electron');
const httpProxy = require("http-proxy");
const http = require("http");
const https = require("http");
const url = require("url");
const net = require("net");
const promise = require("promise");
const freeport = require("find-free-port");
const wstun = require("reverse-wstunnel");
const proxyAgent = require('proxy-agent');
const serverDomainName = "wildnetservices-dev.pcloudy.com";
const WILDNET_SERVER_USERNAME= "Wh@t$yourep@$$word";
const WILDNET_SERVER_PASSWORD= "I@mpCloudi@n";

ipcMain.on("authenticate-user", (event, receivedData)=>{
  console.log("RESPONSE:" + JSON.stringify(receivedData));
  global.emailAddress = receivedData.emailAddress;
  global.apiAccessKey = receivedData.apiAccessKey;
  global.cloudUrl = receivedData.cloudUrl;

  let requestOption = {
    host: serverDomainName,
    port: 80,
    path: "/authentication",
    method: "POST",
    headers: {
      "content-type": "application/json"
    }
  }

  if(Object.keys(receivedData.proxiesInfo).length > 0){
    if(receivedData.proxiesInfo.hasOwnProperty("debugProxy")){
      global.debugProxy = receivedData.proxiesInfo.debugProxy;
      global.generatedProxyAgent = new proxyAgent(receivedData.proxiesInfo.debugProxy);
      requestOption.agent = global.generatedProxyAgent;
    }else if(receivedData.proxiesInfo.hasOwnProperty("directProxy")){
      global.directProxy = receivedData.proxiesInfo.directProxy;
      global.generatedProxyAgent = new proxyAgent(receivedData.proxiesInfo.directProxy);
      requestOption.agent = global.generatedProxyAgent;
    }else if(receivedData.proxiesInfo.hasOwnProperty("pacProxy")){
      global.pacProxy = receivedData.proxiesInfo.pacProxy;
      global.generatedProxyAgent = new proxyAgent(receivedData.proxiesInfo.pacProxy);
      requestOption.agent = global.generatedProxyAgent;
    }
  }

  let requestToAuthenticateUser = http.request(requestOption, (res)=>{
    let responseData = null;
    res.on("data", (data)=>{
      console.log(`BODY: ${data}`);
      if(responseData == null){
        responseData = data;
      }else{
        responseData += data;
      }
    });
    res.on("end", ()=>{
      responseData = JSON.parse(responseData);
      event.reply("authenticate-user", {
        status: true,
        data: {
          success: responseData
        }
      });
      global.wildnetSessionPort = responseData.port;
      global.sessionid = responseData.sessionid;
    });
  });

  requestToAuthenticateUser.on("error", (flaw)=>{
    console.log(`error : ${JSON.stringify(flaw)}`);
    event.reply("authenticate-user", {
      status: false,
      data: {
        error: flaw
      }
    });
  });

  requestToAuthenticateUser.write(JSON.stringify({
    emailid: receivedData.emailAddress,
    apikey: receivedData.apiAccessKey,
    cloudurl: receivedData.cloudUrl
  }));

  requestToAuthenticateUser.end(()=>{
    console.log("User Authenticated successfully...");
  });
});

var wilnetSendEventListener = null;
ipcMain.on("wildnet", (event, receivedData)=>{
  wilnetSendEventListener = event;
  switch (receivedData.status) {
    case "start":
      wildnetHandler.start(receivedData.port);
      event.reply("wildnet", {
        status: "Started",
        msg: "Started the wildnet successfully..."
      });
      break;
    case "stop":
      wildnetHandler.stop(()=>{
        event.reply("wildnet", {
          status: "Stopped",
          msg: "Stoped the wildnet successfully..."
        });
      });
      break;  
    default:
      break;
  }
});

ipcMain.on("getDeviceList", (event, receivedData)=>{
  utilityHanlder.getDeviceList(receivedData).then((response)=>{
    event.reply("getDeviceList", {
      platform: receivedData.platform,
      success: JSON.parse(response)
    });
  },(flaw)=>{
    event.reply("getDeviceList", {
      platform: receivedData.platform,
      error: flaw
    });
  });
});

class wildnet{

  constructor(){
    this.reverse_client = new wstun.reverseClient();
  }
  start(remoteServerPort){
      freeport(30000, 50000, '127.0.0.1', 1, (err, freePort)=>{
          if(err){
              console.error('Could not get free freeport : ERROR : ' + err);
          }else{
            var server = http.createServer((req, res)=>{
                var urlObj = url.parse(req.url);
                var target = urlObj.protocol + "//" + urlObj.host;    
                console.log("Proxy HTTP request for:", target);
                wilnetSendEventListener.reply("wildnet", {
                  status: "logs",
                  msg: "Proxy HTTP request for : " + target
                });
                var proxy = httpProxy.createProxyServer({});
                proxy.on("error", (err, req, res)=>{
                    console.error("proxy error", err);
                    res.end();
                });
    
                proxy.web(req, res, { target: target });
            }).listen(freePort);  //this is the port your clients will connect to
    
            var regex_hostport = /^([^:]+)(:([0-9]+))?$/;    
            var getHostPortFromString = (hostString, defaultPort)=>{
                var host = hostString;
                var port = defaultPort;
                var result = regex_hostport.exec(hostString);
                if (result != null) {
                    host = result[1];
                    if (result[2] != null) {
                        port = result[3];
                    }
                }
    
                return ([host, port]);
            };
    
            server.addListener('connect', (req, socket, bodyhead)=>{
                var hostPort = getHostPortFromString(req.url, 443);
                var hostDomain = hostPort[0];
                var port = parseInt(hostPort[1]);
                console.log("Proxying HTTPS request for:", hostDomain, port);
                wilnetSendEventListener.reply("wildnet", {
                  status: "logs",
                  msg: "Proxying HTTPS request for : " + hostDomain
                });
                var proxySocket = new net.Socket();
                proxySocket.connect(port, hostDomain,()=>{
                    proxySocket.write(bodyhead);
                    socket.write("HTTP/" + req.httpVersion + " 200 Connection established\r\n\r\n");
                });
    
                proxySocket.on("data", (chunk)=>{
                    socket.write(chunk);
                });
    
                proxySocket.on("end", ()=>{
                    socket.end();
                });
    
                proxySocket.on("error", ()=>{
                    socket.write("HTTP/" + req.httpVersion + " 500 Connection error\r\n\r\n");
                    socket.end();
                });
    
                socket.on("data", (chunk)=>{
                    proxySocket.write(chunk);
                });
    
                socket.on("end", ()=>{
                    proxySocket.end();
                });
    
                socket.on("error", ()=>{
                    proxySocket.end();
                });
            });

            if(global.hasOwnProperty("debugProxy")){
              this.reverse_client.start(remoteServerPort, "wss://" + serverDomainName, global.debugProxy, global.generatedProxyAgent);
            }else if(global.hasOwnProperty("directProxy")){
              this.reverse_client.start(remoteServerPort, "wss://" + serverDomainName, global.directProxy, global.generatedProxyAgent);
            }else{
              this.reverse_client.start(remoteServerPort, "wss://" + serverDomainName, "127.0.0.1:" + freePort);
            }
          }
      });
  }

  stop(callBack){    
    let requestOption = {
      host: serverDomainName,
      port: 80,
      path: "/unlinkuserinfos",
      method: "POST",
      headers: {
        "content-type": "application/json"
      }
    }

    if(global.hasOwnProperty("generatedProxyAgent")){
      requestOption.agent = global.generatedProxyAgent;
    }
  
    let requestToUnlinkUser = http.request(requestOption, (res)=>{
      let responseData = null;
      res.on("data", (data)=>{
        console.log(`BODY: ${data}`);
        if(responseData == null){
          responseData = data;
        }else{
          responseData += data;
        }
      });
      res.on("end", ()=>{
        console.log("Response : " + responseData);
        this.reverse_client.stop();
        callBack();
      });
    });
  
    requestToUnlinkUser.on("error", (flaw)=>{
      console.log(`error : ${JSON.stringify(flaw)}`);
      callBack();
    });
  
    requestToUnlinkUser.write(JSON.stringify({
      emailid: global.emailAddress
    }));
  
    requestToUnlinkUser.end(()=>{
      console.log("Wildnet stopped successfully...");
    });
  }
}

class androidTunnel{
    
    authenticate(){
        
    }

    start(){
        console.log("Starting android tunnel....");
    }
}

class iosTunnel{
    
    authenticate(){
        
    }

    start(){
        console.log("Starting ios tunnel....");
    }
}

class utilities{
  getDeviceList(data){
    return new promise((resolve, reject)=>{
      let requestOption = {
        host: serverDomainName,
        port: 80,
        path: "/getDeviceList",
        method: "POST",
        headers: {
          "content-type": "application/json"
        }
      }
  
      let requestData = JSON.stringify({
        auth_username: WILDNET_SERVER_USERNAME,
        auth_password:  WILDNET_SERVER_PASSWORD,
        sessionid: global.sessionid,
        cloudurl: global.cloudUrl,
        platform: data.platform
      });
  
      this.processHttpRequest(requestOption, requestData).then((response)=>{
        resolve(response);
      },(flaw)=>{
        reject(flaw);
      });
    });
  }

  processHttpRequest(requestOption, requestData){
    return new promise((resolve, reject)=>{
      let requestToUnlinkUser = http.request(requestOption, (res)=>{
        let responseData = null;
        res.on("data", (data)=>{
          if(responseData == null){
            responseData = data;
          }else{
            responseData += data;
          }
        });
        res.on("end", ()=>{
          console.log("Request response : " + responseData);
          resolve(responseData);
        });
      });
    
      requestToUnlinkUser.on("error", (flaw)=>{
        console.log(`Request error : ${JSON.stringify(flaw)}`);
        reject(flaw);
      });
    
      requestToUnlinkUser.write(requestData);
      requestToUnlinkUser.end(()=>{
        console.log("HTTP request processed successfully...");
      });
    });
  }

  processHttpsRequest(requestOption, requestData){
    return new promise((resolve, reject)=>{
      let requestToUnlinkUser = https.request(requestOption, (res)=>{
        let responseData = null;
        res.on("data", (data)=>{
          if(responseData == null){
            responseData = data;
          }else{
            responseData += data;
          }
        });
        res.on("end", ()=>{
          console.log("Request response : " + responseData);
          resolve(responseData);
        });
      });
    
      requestToUnlinkUser.on("error", (flaw)=>{
        console.log(`Request error : ${JSON.stringify(flaw)}`);
        reject(flaw);
      });
    
      requestToUnlinkUser.write(requestData);
      requestToUnlinkUser.end(()=>{
        console.log("HTTPS request processed successfully...");
      });
    });
  }
}

var wildnetHandler = new wildnet();
var utilityHanlder = new utilities();

module.exports = { wildnetHandler, androidTunnel, iosTunnel };