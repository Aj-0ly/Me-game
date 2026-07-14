from PIL import Image, ImageDraw, ImageFont
import os

def make_icon(size):
    img = Image.new("RGBA", (size, size), (4, 8, 4, 255))
    d = ImageDraw.Draw(img)
    # green rounded border
    m = int(size * 0.06)
    d.rounded_rectangle([m, m, size - m, size - m], radius=int(size*0.12),
                        outline=(51, 255, 102, 255), width=max(3, int(size*0.025)))
    # scanline texture faint
    for y in range(m, size - m, max(2, int(size*0.018))):
        d.line([(m, y), (size - m, y)], fill=(10, 26, 10, 120), width=1)
    # text DTF
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", int(size*0.30))
    except Exception:
        font = ImageFont.load_default()
    txt = "DTF"
    tb = d.textbbox((0, 0), txt, font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    d.text(((size - tw)/2 - tb[0], (size*0.40) - tb[1]), txt, font=font, fill=(170, 255, 187, 255))
    # little robot face under
    cy = int(size*0.74); r = int(size*0.05)
    d.ellipse([size/2 - r, cy - r, size/2 + r, cy + r], outline=(51,255,102,255), width=max(2,int(size*0.012)))
    d.ellipse([size/2 - r*0.45, cy - r*0.4, size/2 - r*0.05, cy + r*0.1], fill=(255,255,255,230))
    d.ellipse([size/2 + r*0.05, cy - r*0.4, size/2 + r*0.45, cy + r*0.1], fill=(255,255,255,230))
    d.line([size/2 - r*1.6, cy - r*1.4, size/2 - r*0.9, cy - r*1.4], fill=(51,255,102,255), width=max(2,int(size*0.012)))
    d.line([size/2 + r*0.9, cy - r*1.4, size/2 + r*1.6, cy - r*1.4], fill=(51,255,102,255), width=max(2,int(size*0.012)))
    return img

here = os.path.dirname(os.path.abspath(__file__))
big = make_icon(512)
big.save(os.path.join(here, "icon-512.png"))
big.resize((192, 192)).save(os.path.join(here, "icon-192.png"))
print("icons written: icon-192.png, icon-512.png")
