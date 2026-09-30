"""Generate the site's editorial images through Kie. Reads KIE_API_KEY from the process environment only."""
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
import json
import os
import time

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'images' / 'generated'
API = 'https://api.kie.ai/api/v1/jobs'
MODEL = 'nano-banana-pro'
ASSETS = [
    ('business-city', 'Photographic architectural editorial for an entrepreneur website. A beautifully composed contemporary Southeast Asian city business district, viewed from an elevated quiet terrace with tropical planting. Restrained modern glass towers and pale concrete architecture, blue grey windows, soft bright morning sky, subtle warm sun. Strong horizontal composition with architectural depth, natural atmosphere, sophisticated business magazine photography, realistic materials, no dramatic effects, no oversaturation. Clean white and slate blue palette. No people, no logos, no words, no graphics or UI. This is a conceptual editorial image, not documentation of a particular office.'),
    ('ai-perspective', 'A refined photographic editorial still life about artificial intelligence and human creativity. One sculptural precision-machined brushed aluminium folded ribbon resting on a cool white stone table, with a single deep navy glass panel behind it. Soft directional daylight, delicate real shadows, tactile material detail, extremely restrained and sophisticated composition for an architectural design magazine. Asymmetrical arrangement, quiet white negative space, natural reflections, no glowing effects, no neon, no robot, no brain, no text, no logos, no infographics, no UI. Premium studio photography, silver, white and deep blue.'),
    ('creator-studio', 'Editorial photographic image for a sophisticated creator economy article. An unbranded professional cinema camera in the foreground of a quiet contemporary content studio, a subtle large softbox and folded navy backdrop in the distance, bright natural window light, pale grey wall, soft shadows, careful cinematic composition, real tactile equipment and clean purposeful workspace. The camera fills the right half with generous calm space at left. Muted blue, silver and cool white. No people, no text, no logos, no watermark, no exaggerated color grade. Not a photograph of a named company, a conceptual creative-work image.'),
]


def api_request(endpoint, data=None):
    key = os.environ['KIE_API_KEY']
    request = Request(API + endpoint, data=json.dumps(data).encode() if data else None,
                      headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    try:
        with urlopen(request, timeout=60) as response:
            result = json.load(response)
    except HTTPError as error:
        raise RuntimeError(f'Kie returned HTTP {error.code}') from None
    if result.get('code') != 200:
        message = str(result.get('msg', 'Unknown API error')).replace(key, '[redacted]')
        raise RuntimeError(f'Kie error {result.get("code")}: {message}')
    return result['data']


def main():
    OUT.mkdir(exist_ok=True, parents=True)
    manifest_path = OUT / 'manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    for name, prompt in ASSETS:
        if (OUT / (name + '.jpg')).exists():
            print(name + ': already downloaded', flush=True)
            continue
        if name not in manifest:
            data = api_request('/createTask', {'model': MODEL, 'input': {'prompt': prompt, 'image_input': [], 'aspect_ratio': '3:2', 'resolution': '2K', 'output_format': 'jpg'}})
            manifest[name] = {'provider': 'Kie.ai', 'model': MODEL, 'taskId': data['taskId'], 'prompt': prompt, 'purpose': 'Conceptual editorial illustration'}
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
            print(name + ': submitted', flush=True)
    deadline = time.monotonic() + 900
    pending = {name for name, prompt in ASSETS if not (OUT / (name + '.jpg')).exists()}
    last_states = {}
    while pending and time.monotonic() < deadline:
        for name in list(pending):
            data = api_request('/recordInfo?' + urlencode({'taskId': manifest[name]['taskId']}))
            state = data['state']
            if last_states.get(name) != state:
                print(f'{name}: {state}', flush=True)
                last_states[name] = state
            if state == 'fail':
                raise RuntimeError(f'Generation failed for {name}: {data.get("failMsg", "Unknown error")}')
            if state == 'success':
                urls = json.loads(data['resultJson'])['resultUrls']
                url = urls[0]
                if urlsplit(url).scheme != 'https':
                    raise RuntimeError('Expected an HTTPS output URL')
                with urlopen(url, timeout=60) as response:
                    content = response.read()
                (OUT / (name + '.jpg')).write_bytes(content)
                manifest[name]['output'] = name + '.jpg'
                manifest[name]['creditsConsumed'] = data.get('creditsConsumed')
                manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
                print(f'{name}: downloaded ({len(content)} bytes)', flush=True)
                pending.remove(name)
        if pending:
            time.sleep(8)
    if pending:
        raise RuntimeError('Generation still pending; rerun this script to resume the saved tasks')
    print('All Kie images downloaded. No credential was saved to disk.', flush=True)


if __name__ == '__main__':
    main()
