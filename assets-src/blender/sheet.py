# join preview frames horizontally (system python + Pillow)
import sys
from PIL import Image
out, *ims = sys.argv[1:]
I = [Image.open(p) for p in ims]
W = sum(i.width for i in I); H = max(i.height for i in I)
s = Image.new('RGB', (W, H))
x = 0
for i in I: s.paste(i, (x, 0)); x += i.width
s.save(out)
