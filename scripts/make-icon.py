"""
生成安卓启动图标（多密度 PNG）+ 网页 favicon。

素材：android/icon-source.png（用户给的官方立绘）。没有该文件时退回自己画的「书 + 晶体」。
"""
from PIL import Image, ImageDraw
import base64
import io
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(BASE, 'android', 'res')
SRC = os.path.join(BASE, 'android', 'icon-source.png')
WEB = os.path.join(BASE, 'web')

SIZES = (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192))


def fallback():
    """没有立绘时的手绘图标：深色圆角块 + 书本 + 晶体。"""
    S = 512
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((16, 16, S - 16, S - 16), radius=120, fill=(22, 32, 43, 255))
    cx, cy, w, h = 256, 116, 62, 62
    d.polygon([(cx, cy - h), (cx + w, cy), (cx, cy + h), (cx - w, cy)], fill=(73, 198, 230, 255))
    d.polygon([(88, 214), (248, 248), (248, 424), (88, 372)], fill=(233, 242, 248, 255))
    d.polygon([(424, 214), (264, 248), (264, 424), (424, 372)], fill=(185, 210, 228, 255))
    d.rectangle((252, 240, 260, 420), fill=(22, 32, 43, 255))
    for y in (286, 330, 374):
        d.line([(116, y), (214, y + 20)], fill=(143, 176, 200, 255), width=7)
        d.line([(298, y + 20), (396, y)], fill=(143, 176, 200, 255), width=7)
    return img.convert('RGB')


def square(img, pad_ratio=0.06, bg=(255, 255, 255)):
    """把内容摆进正方形白底，留一点点边。"""
    w, h = img.size
    side = int(max(w, h) * (1 + pad_ratio * 2))
    canvas = Image.new('RGB', (side, side), bg)
    canvas.paste(img, ((side - w) // 2, (side - h) // 2))
    return canvas


def flatten(img):
    """透明底铺到白底上（源图是带阴影的透明 PNG，直接转 RGB 会把底压成黑色）。"""
    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
        img = img.convert('RGBA')
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        return bg
    return img.convert('RGB')


def main():
    if os.path.exists(SRC):
        art = flatten(Image.open(SRC))
        print('用立绘：', SRC, art.size)
    else:
        art = fallback()
        print('没找到 icon-source.png，用手绘图标')
    base = square(art)

    for name, px in SIZES:
        d = os.path.join(RES, 'mipmap-' + name)
        os.makedirs(d, exist_ok=True)
        base.resize((px, px), Image.LANCZOS).save(os.path.join(d, 'ic_launcher.png'))
        print('wrote', os.path.join(d, 'ic_launcher.png'), px)

    # 网页 favicon（64px，base64 内联）
    buf = io.BytesIO()
    base.resize((64, 64), Image.LANCZOS).save(buf, format='PNG', optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    os.makedirs(WEB, exist_ok=True)
    with open(os.path.join(WEB, 'favicon.b64'), 'w', encoding='ascii') as f:
        f.write(b64)
    print('wrote web/favicon.b64', len(b64), 'chars')

    # 512 预览，方便人眼确认
    base.resize((512, 512), Image.LANCZOS).save(os.path.join(BASE, 'dist', 'icon-preview.png'))


if __name__ == '__main__':
    main()
