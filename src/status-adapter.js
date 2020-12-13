/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

// TODO: Move to helix-status
const { Response } = require('node-fetch');
const { report, HEALTHCHECK_PATH } = require('@adobe/helix-status');

function adapter(fn, opts) {
  return async (req, context) => {
    // TODO: ow_path / rawPath should be a context property
    const url = new URL(req.url);
    const idx = url.pathname.indexOf(context.func.name);
    if (idx >= 0) {
      const suffix = url.pathname.substring(idx + context.func.name.length);
      if (suffix === HEALTHCHECK_PATH) {
        const result = await report(opts);
        return new Response(JSON.stringify(result.body), {
          headers: result.headers,
          status: result.statusCode,
        });
      }
    }
    return fn(req, context);
  };
}

module.exports = {
  helixStatus: adapter,
};
