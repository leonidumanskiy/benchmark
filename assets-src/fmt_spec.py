# Pretty-print spec JSON with short arrays / flat objects on one line (keeps diffs of specs readable).
import json, sys
def fmt(v, ind=0):
    pad = ' ' * ind
    if isinstance(v, dict):
        flat = json.dumps(v)
        if len(flat) < 150 and not any(isinstance(x, (dict, list)) and len(json.dumps(x)) > 40 for x in v.values()):
            return flat
        return '{\n' + ',\n'.join(f'{pad}  {json.dumps(k)}: {fmt(x, ind + 2)}' for k, x in v.items()) + f'\n{pad}}}'
    if isinstance(v, list):
        flat = json.dumps(v)
        if len(flat) < 150:
            return flat
        return '[\n' + ',\n'.join(f'{pad}  {fmt(x, ind + 2)}' for x in v) + f'\n{pad}]'
    return json.dumps(v)
for p in sys.argv[1:]:
    d = json.load(open(p))
    open(p, 'w').write(fmt(d) + '\n')
