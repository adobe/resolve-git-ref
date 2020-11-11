import { Request, Response, Fastly, Headers, ResponseInit } from "@fastly/as-compute";
import { CoralogixLogger } from "./coralogix";

function getQueryParam(qs: string, param: string): string {
  const pairs = qs.split("&");
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].indexOf(param + "=")==0) {
      return pairs[i].substr(param.length + 1);
    }
  }
  return "";
}

function getQueryString(path: string):string {
  if (path.indexOf("?") > 0) {
    return path.substring(path.indexOf("?") + 1);
  }
  return "";
}

// The entry point for your application.
//
// Use this function to define your main request handling logic. It could be
// used to route based on the request properties (such as method or path), send
// the request to a backend, make completely new requests, and/or generate
// synthetic responses.
function main(req: Request): Response {
  const logger = new CoralogixLogger("helix-resolve-git-ref", req);


  // We can filter requests that have unexpected methods.
  const VALID_METHODS = ["HEAD", "GET", "POST"];
  if (!VALID_METHODS.includes(req.method())) {
    logger.error("Invalid method " + req.method());
    return new Response(String.UTF8.encode("This method is not allowed"), {
      status: (405 as i16),
    });
  }

  let urlParts = req.url().split("//").pop().split("/");
  let path = ("/" + urlParts.join("/"));
  let qs = getQueryString(path);

  const owner = getQueryParam(qs, "owner");
  const repo = getQueryParam(qs, "repo"); 
  let ref = getQueryParam(qs, "ref");
  let sha = "";

  if (owner != "" && repo != "" && true) {
    let cacheOverride = new Fastly.CacheOverride();
    cacheOverride.setTTL(30);

    const myreq = new Request("https://github.com/" + owner + "/" + repo + ".git/info/refs?service=git-upload-pack", {});

    const myresp = Fastly.fetch(myreq, {
      backend: "GitHub",
      cacheOverride,
    }).wait();

    logger.debug("Response received for " + owner + "/" + repo);

    if (myresp.status() >= 400 && myresp.status() < 500) {
      logger.error("Repo not found "  + owner + "/" + repo + "(" + myresp.status().toString(10) + ")");
      return new Response(String.UTF8.encode('failed to fetch git repo info (statusCode: ' + myresp.status().toString(10) +', statusMessage: ' + myresp.statusText() + ')'), {
        status: 404
      });
    }

    if (myresp.status() >= 500) {
      logger.error("Bad gateway "  + owner + "/" + repo + "(" + myresp.status().toString(10) + ")");
      return new Response(String.UTF8.encode('failed to fetch git repo info (statusCode: ' + myresp.status().toString(10) +', statusMessage: ' + myresp.statusText() + ')'), {
        status: 502 // bad gateway
      });
    }

    const lines = myresp.text().split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (ref == "" && lines[i].indexOf("symref=HEAD:") > 0) {
        let refline = lines[i].substr(lines[i].indexOf("symref=HEAD:") + 23);
        ref = refline.substr(0, refline.indexOf(" "));
      }
      if (ref != "" && sha == "" && lines[i].indexOf(" refs/heads/" + ref) > 0) {
        sha = lines[i].substr(4, lines[i].indexOf(" refs/heads/" + ref));
        ref = "refs/heads/" + ref;
      }
      if (ref != "" && sha == "" && lines[i].indexOf(" refs/tags/" + ref) > 0) {
        sha = lines[i].substr(4, lines[i].indexOf(" refs/tags/" + ref));
        ref = "refs/tags/" + ref;
      }
    }


    if (sha == "") {
      let init = new ResponseInit();
      init.status = 404;
      return new Response(String.UTF8.encode('ref not found ' + ref), init);
    }

    const myheaders = new Headers();
    myheaders.set("Content-Type", "application/json");

    logger.debug("returning " +  + owner + "/" + repo + " " + sha);

    return new Response(String.UTF8.encode('{ "fqRef": "' + ref + '", "sha": "' + sha + '"  }'), {
      status: 200,
      headers: myheaders
    });
  }

  // Console.log('{ "timestamp": ' + Date.now().toString() + ', "applicationName":"fastly-edgecompute", "subsystemName":"helix-resolve-git-ref", "severity": 4, "json": { "message": "required parameters missing", "cdn": { "url": "' + req.url() + '" }}}');
  return new Response(String.UTF8.encode('owner and repo are mandatory parameters!'), {
    status: 400
  });
}

// Get the request from the client.
let req = Fastly.getClientRequest();

// Pass the request to the main request handler function.
let resp = main(req);

// Send the response back to the client.
Fastly.respondWith(resp);
