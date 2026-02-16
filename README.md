# microfn

[MicroFn](https://microfn.dev) is a platform for running and deploying tiny JavaScript functions. This is the official CLI client.

## Installation

```bash
npm install -g microfn
```

Both `microfn` and `mfn` commands are available after installation.

## Authentication

Set your API token as an environment variable:

```bash
export MICROFN_API_TOKEN="mfn_your_token_here"
```

Or pass it directly with `--token`:

```bash
microfn --token mfn_xxx list
```

## Commands

### List functions

```bash
microfn list
```

Output:
```
NAME                     STATUS    VISIBILITY  MCP
alice/weather-fn         deployed  private     no
alice/greeting-service   deployed  public      yes
```

### Create a function

```bash
# From file
microfn create my-function ./src/main.ts

# From stdin
cat main.ts | microfn create my-function -
```

### Get function info

```bash
microfn info alice/weather-fn
```

Output:
```
Function: alice/weather-fn
Visibility: private
MCP Tool: disabled
Status: deployed
Packages: @microfn/fn@latest
Secrets: API_KEY

Latest Deployment:
  ID: 207
  Status: deployed
  Hash: 73694ab5b956...
  Deployed: 2025-09-28T02:34:26
  Signature: async main(city)

Last Execution: success at 2026-02-15T15:29:15Z
```

### Get function code

```bash
microfn code alice/weather-fn
```

### Push code updates

```bash
# From file
microfn push alice/weather-fn ./src/main.ts

# From stdin
cat main.ts | microfn push alice/weather-fn -
```

### Execute a function

```bash
# With inline JSON
microfn execute alice/weather-fn '{"city": "tokyo"}'

# With stdin
echo '{"city": "tokyo"}' | microfn execute alice/weather-fn -

# Include execution logs
microfn execute alice/weather-fn '{}' --include-logs
```

## Output formats

Use `--output json` for JSON output (useful for scripting):

```bash
microfn --output json list
microfn --output json info alice/weather-fn
```

## Writing functions

Functions must export an entrypoint:

```typescript
// Direct main export
export async function main(input) {
  const { name = "world" } = input || {};
  return { greeting: `hello ${name}` };
}
```

Or any named export (auto-wrapped as main):

```typescript
export async function getWeather(input) {
  const { city = "tokyo" } = input || {};
  const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=3`);
  return { weather: await res.text() };
}
```

### Using MicroFn modules

```typescript
import kv from "@microfn/kv";
import secret from "@microfn/secret";

export async function main() {
  const apiKey = await secret.get("API_KEY");
  const cached = await kv.get("data");

  if (cached) return cached;

  const data = await fetchData(apiKey);
  await kv.set("data", data, { ttl: 3600 });
  return data;
}
```

## Debug mode

Enable verbose output with `--debug`:

```bash
microfn --debug list
```

## License

AGPL-3.0-only
