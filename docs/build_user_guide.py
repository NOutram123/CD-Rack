from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/pdf/Home-Music-User-Guide.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
if Path('C:/Windows/Fonts/arial.ttf').exists():
    pdfmetrics.registerFont(TTFont('Arial', 'C:/Windows/Fonts/arial.ttf'))
    pdfmetrics.registerFont(TTFont('ArialB', 'C:/Windows/Fonts/arialbd.ttf'))
elif Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf').exists():
    pdfmetrics.registerFont(TTFont('Arial', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
    pdfmetrics.registerFont(TTFont('ArialB', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
else:
    pdfmetrics.registerFont(pdfmetrics.Font('Arial', 'Helvetica', 'WinAnsiEncoding'))
    pdfmetrics.registerFont(pdfmetrics.Font('ArialB', 'Helvetica-Bold', 'WinAnsiEncoding'))
pdfmetrics.registerFontFamily('Arial', normal='Arial', bold='ArialB', italic='Arial', boldItalic='ArialB')
W, H = 595.276, 841.89
INK = HexColor('#26342f'); MUTED = HexColor('#59665e'); GREEN = HexColor('#335f50')
PALE = HexColor('#edf2ed'); GOLD = HexColor('#e8bb76'); DARK = HexColor('#171914')
c = canvas.Canvas(str(OUT), pagesize=(W,H))
c.setTitle('CD Rack Guide')
c.setAuthor('Home Music')
c.setSubject('Rack, Carousel, Demo, home NAS setup and session persistence; 14 November 2026')
style = ParagraphStyle('body', fontName='Arial', fontSize=11, leading=16, textColor=INK)
small = ParagraphStyle('small', parent=style, fontSize=9, leading=13, textColor=MUTED)

def para(text,x,y,w=499,sz=None):
    s=style if sz is None else ParagraphStyle('custom',parent=style,fontSize=sz,leading=sz*1.42)
    p=Paragraph(text,s); _,h=p.wrap(w,700); p.drawOn(c,x,H-y-h); return y+h

def text(t,x,y,size=11,color=INK,bold=False):
    c.setFillColor(color); c.setFont('ArialB' if bold else 'Arial',size); c.drawString(x,H-y,t)

def rect(x,y,w,h,fill,stroke=None,r=0):
    c.setFillColor(fill); c.setStrokeColor(stroke or fill)
    if r:c.roundRect(x,H-y-h,w,h,r,fill=1,stroke=bool(stroke))
    else:c.rect(x,H-y-h,w,h,fill=1,stroke=bool(stroke))

def line(x1,y1,x2,y2,color=GREEN,width=1):
    c.setStrokeColor(color);c.setLineWidth(width);c.line(x1,H-y1,x2,H-y2)

def badge(n,x,y):
    c.setFillColor(GOLD);c.setStrokeColor(DARK);c.setLineWidth(.7);c.circle(x,H-y,10,fill=1,stroke=1)
    c.setFillColor(DARK);c.setFont('ArialB',10);c.drawCentredString(x,H-y-3,str(n))

def call(n,x,y,targetx,targety):
    line(x,y,targetx,targety,GOLD,1.3);badge(n,x,y)

def heading(k,title,sub):
    rect(0,0,W,H,HexColor('#fcfcf8'))
    text('HOME MUSIC  /  USER GUIDE',48,37,9,GREEN,True)
    text(k,48,80,10,GREEN,True)
    text(title,48,114,27,INK,True)
    para(sub,48,132,499,11)

def finish(n):
    line(48,792,547,792,HexColor('#d8e0d8'))
    text('Current app • 14 November 2026',48,810,8,MUTED)
    c.setFont('Arial',8);c.drawRightString(547,H-810,f'{c.getPageNumber()} / 12')
    c.showPage()

def item(n,title,body,y,x=48,w=499):
    badge(n,x+10,y+12)
    text(title,x+29,y+10,11,INK,True)
    return para(body,x+29,y+19,w-29,10)+11

def bullet(body,y):
    text('•',51,y+11,10,GREEN)
    return para(body,64,y,483,10)+4

def todo(n,title,body,y):
    c.setStrokeColor(GREEN);c.setLineWidth(1);c.rect(49,H-y-12,11,11,fill=0,stroke=1)
    text(f'{n}. {title}',70,y+10,11,INK,True)
    return para(body,70,y+19,477,10)+15

def note(title,body,y,h=72):
    rect(48,y,499,h,PALE,r=8);text(title,62,y+22,11,GREEN,True)
    para(body,62,y+31,471,10)

def button(label,x,y,w=70,h=28,gold=False,size=10):
    rect(x,y,w,h,GOLD if gold else HexColor('#30332b'),HexColor('#626750'),4)
    c.setFillColor(DARK if gold else HexColor('#f3eddf'));c.setFont('Arial',size)
    c.drawCentredString(x+w/2,H-y-h/2-3,label)

def field(label,value,x,y,w=300):
    text(label,x,y,9,HexColor('#e9e5d8'));rect(x,y+7,w,27,DARK,HexColor('#494c3e'),4)
    text(value,x+9,y+25,9,HexColor('#ddd8ca'))

def tablet(x,y,w=499,h=230):
    rect(x,y,w,h,HexColor('#25282a'),r=13);rect(x+9,y+9,w-18,h-18,HexColor('#000000'),r=5)

def shelf(x,y,w,h):
    rect(x,y,w,h,HexColor('#5a513b'));rect(x+2,y+4,w-4,h-9,HexColor('#11130f'))
    names=['Settings','Now Playing','Trans-Europe Express','The Concerts in China','Evening Music','Blue Horizon','Night Journey','Piano Works','Quiet Places','Autumn Songs','Live Sessions','String Quartet','Ocean Light','City Sounds']
    colors=['#c6b483','#91a08a','#b33d34','#ded2ac','#7b8d9c','#a3b1ba','#d1aa79','#bac7a2','#79688a','#c8bba1','#abc0bb','#a27d68','#758f9f','#a8a98c']
    sw=(h-16)/12;cur=x+6
    for i in range(50):
        ni=i if i<len(names) else 2+(i-len(names))%(len(names)-2)
        name=names[ni]; col=HexColor(colors[ni])
        if cur+sw>w+x-5:break
        ww=sw*2.25 if i==3 else sw
        rect(cur,y+8,ww,h-20,col,HexColor('#686b60'),1)
        if i==3:
            rect(cur+sw,y+8,sw*.25,h-20,HexColor('#080808'))
        c.saveState();c.translate(cur+sw*.64,H-(y+21));c.rotate(-90)
        c.setFont('ArialB' if i<2 else 'Arial',7);c.setFillColor(DARK if i!=2 else white)
        c.drawString(0,0,name);c.restoreState();cur+=ww+2
        if i==3:
            c.saveState();c.translate(cur-ww-2+sw*1.90,H-(y+21));c.rotate(-90)
            c.setFont('Arial',7);c.setFillColor(DARK);c.drawString(0,0,'Kraftwerk');c.restoreState()
    return sw

def cover(x,y,s=220):
    rect(x,y,s,s,HexColor('#a62f2c'),HexColor('#b4a489'),3)
    rect(x+18,y+18,s-36,s-36,HexColor('#e6d6b7'))
    stride=max(2,(s-125)/6)
    for i in range(7):line(x+25,y+90+i*stride,x+s-25,y+78+i*stride,HexColor('#6d7976'),2)
    text('TRANS-EUROPE',x+29,y+48,13,INK,True);text('EXPRESS',x+29,y+66,13,INK,True)
    text('Illustrative album artwork',x+28,y+s-20,8,INK)
    rect(x,y+s,s,30,HexColor('#23261f'))
    text('Track 1' if s<190 else 'Europe Endless',x+6,y+s+19,7,white)
    button('|<',x+s-126,y+s+3,25,24,size=8);button('Pause',x+s-98,y+s+3,44,24,gold=True,size=8)
    button('>|',x+s-51,y+s+3,25,24,size=8);button('V',x+s-23,y+s+3,20,24,size=8)

# Cover: supplied screenshot, uncropped and at its original proportions.
rect(0,0,W,H,HexColor('#fcfcf8'))
text('HOME MUSIC',48,68,11,GREEN,True)
text('CD Rack Guide',48,157,38,INK,True)
para('Your music collection, at your fingertips.',48,182,499,14)
cover_image=ROOT / 'docs/assets/cover.png'
c.drawImage(str(cover_image),24,H-305-196,547,196,preserveAspectRatio=True,anchor='c',mask='auto')
text('A guide for phone and tablet users',48,566,17,INK,True)
para('Browse in Rack or Carousel, control playback and adjust volume. Includes Demo mode, annotated interface illustrations, system requirements and an installation checklist.',48,586,475,12)
line(48,710,547,710,HexColor('#d8e0d8'))
text('Rack, Carousel and Demo • 14 November 2026',48,734,10,MUTED)
text('How to use  /  Interface  /  Setup  /  Troubleshooting',48,758,10,GREEN)
finish(0)

# 1: concise everyday workflow
heading('01  /  START HERE','Your music, on a CD rack','A simple guide for using Home Music on a phone or tablet.')
tablet(48,186,499,212);shelf(59,219,477,148)
text('Illustration of the rack; album names and artwork are examples.',48,416,9,MUTED)
y=para('Home Music is a web app that lets you browse music stored on your NAS and control playback on your amplifier. Your phone or tablet acts as the remote control; the NAS and amplifier handle the music.',48,438)
text('How to use',48,y+30,17,INK,True)
y+=48
y=item(1,'Open and connect','Join your home Wi-Fi and open the app address below. Sign in if asked, then choose your Denon under <b>Play through</b> and tap <b>Open rack</b>.',y)
y=item(2,'Choose and play','Browse the spines in Rack, or switch to <b>Carousel</b> in Settings. Choose an album, then tap <b>Play</b>. Browsing alone never starts music.',y)
y=item(3,'Control and return','Use Pause, the track buttons or <b>V</b> for volume. In Rack, double-tap the cover to put it back; in Carousel it stays open. Music keeps playing.',y)
rect(48,729,499,43,PALE,r=7);text('Open in your browser:',61,747,9,GREEN,True)
text('http://[YourNASName].local:8787',61,763,12,INK,True)
finish(1)

# 2: connection
heading('02  /  CONNECT','Sign in and choose the amp','This screen appears when the app needs a new connection. Later visits may open the rack directly.')
rect(48,184,324,338,HexColor('#252720'),HexColor('#494c3e'),10)
text('Connect your music',68,216,19,white)
field('NAS address','http://[YourNASName].local:5000',68,244,212);button('Find NAS',286,251,68,27,size=8)
field('DSM username','Your own DSM account',68,294,286)
field('Password','Enter your password',68,344,286)
field('Verification code, if enabled','Only if your account uses a code',68,394,286)
button('Sign in',68,457,90,30,True);button('Demo',170,457,82,30)
text('Output selection appears after sign-in.',68,508,9,HexColor('#bcb7a6'))
call(1,400,257,350,265);call(2,400,323,350,322);call(3,400,412,350,416);call(4,400,472,205,494)
text('Illustration: sign-in screen. Do not share your password.',48,543,9,MUTED)
y=568
y=item(1,'NAS address and Find NAS','Let the app find the NAS. Replace <b>[YourNASName]</b> with your NAS name, without the brackets. This is the DSM address, not the app address ending in :8787.',y)
y=item(2,'DSM username and Password','Use an account allowed to use Audio Station and the amplifier. The app does not save your password.',y)
y=item(3,'Verification code','Enter the current code only if your DSM account requires it.',y)
y=item(4,'Sign in, then Play through - or choose Demo','For your music, choose the Denon and tap <b>Open rack</b>. <b>Demo</b> opens local sample albums with silent simulated controls; no NAS login is needed.',y)
finish(2)

# 3 rack
heading('03  /  BROWSE','Meet the rack','Swipe sideways to browse. Tap a spine to open it. Turn your device sideways if you prefer a wider view.')
tablet(48,196,499,246);sw=shelf(59,225,477,181)
call(1,83,202,73,255);call(2,122,202,90,270);call(3,260,202,143,285);call(4,414,202,122,390)
text('Illustration: the first two spines always stay at the start of the rack.',48,463,9,MUTED)
y=490
y=item(1,'Settings','Tap this spine to switch Rack / Carousel, adjust CD size, sort, refresh or change the output device.',y)
y=item(2,'Now Playing','Brings the album currently reported by Audio Station into view when it can be identified in the rack. It does not start music.',y)
y=item(3,'Album spines','Tap to see the cover. Some multi-disc albums use a wider, two-panel case with a black centre. Real-album colours are based on their artwork.',y)
y=item(4,'Your albums only','NAS mode shows real albums, plus Settings and Now Playing. With no albums, it says <b>No albums found</b>. The 97 synthetic sample albums appear only in Demo.',y)
note('Browsing is quiet','Opening or closing an album does not start or stop music. Your browser remembers its rack position and CD size.',716,62)
finish(3)

# Carousel
heading('04  /  BROWSE','The album carousel','Choose Settings > Display mode > Carousel. Your browser remembers the choice; a new browser starts in Rack.')
tablet(48,192,499,254)
button('Settings',210,204,72,24,size=9);button('Now Playing',288,204,86,24,size=9)
rect(59,238,477,193,HexColor('#11130f'))
cover(218,241,160)
for side in [-1,1]:
    for i in range(4):
        xx=218-17-(i+1)*17 if side<0 else 378+15+i*17
        rect(xx,241,13,160,HexColor(['#c6b483','#7b8d9c','#b33d34','#91a08a'][i]),HexColor('#686b60'),1)
        c.saveState();c.translate(xx+9,H-251);c.rotate(-90);c.setFont('Arial',7);c.setFillColor(DARK);c.drawString(0,0,['Neighbouring album','Next selection','A favourite album','Another album'][i]);c.restoreState()
button('<',65,400,33,27,size=18);button('>',497,400,33,27,size=18)
call(1,190,211,211,215);call(2,389,218,367,215);call(3,397,294,349,288);call(4,440,380,410,341);call(5,476,422,500,414)
text('Illustration: a centred cover, neighbouring spines and fixed utility buttons.',48,466,9,MUTED)
y=491
y=item(1,'Settings stays in one place','Use the fixed button above the frame. Switch back to Rack at any time.',y)
y=item(2,'Now Playing','Returns to the album reported by Audio Station, without starting music.',y)
y=item(3,'The focused album','The centred cover stays open. Cached artwork is at most 512 x 512 pixels.',y)
y=item(4,'Neighbouring spines','Tap a spine to focus it. Up to four neighbours appear on each side when space allows.',y)
y=item(5,'Swipe, drag or use the album arrows','Swipe left / right, drag, or use album arrows and keyboard Left / Right. Ends wrap around.',y)
note('Browse without changing the music','Browsing stays on your selection. Album arrows browse albums; the controls below the cover change tracks. Only Play starts a newly selected album.',716,62)
finish(4)

# Playback and volume
heading('05  /  LISTEN','Playback and volume','Controls sit below the cover in both display modes. The example shows music already playing.')
tablet(48,185,499,260);shelf(59,205,477,220);cover(76,200,195)
rect(130,259,86,78,HexColor('#252720'),HexColor('#777c67'),3)
text('Volume',156,271,7,HexColor('#d2c9b5'));text('X',206,271,8,white)
button('-',137,280,21,19,size=10);text('41',168,293,9,white);button('+',188,280,21,19,size=10)
button('Mute',137,308,72,21,size=7)
call(1,88,431,112,411);call(2,174,431,167,411);call(3,291,220,245,242);call(4,270,431,260,411)
call(5,325,300,210,269)
text('Illustration: the smaller volume popup sits over the album artwork.',48,465,9,MUTED)
y=488
y=item(1,'Track title','Shows the current track for the playing album, or its first track before you start it.',y)
y=item(2,'Previous, Play / Pause, Next','Play starts a selected album from track one, replacing the playlist on the amp. If that album is already loaded, it pauses or resumes. Previous/Next skip tracks and resume playback if paused; they disable at the album ends.',y)
y=item(3,'Close a Rack cover','Double-tap the artwork in Rack; music keeps playing. Carousel keeps the focused cover open. There is no progress bar or track-selection list.',y)
y=item(4,'V opens volume','Use - or + for small changes. Mute sets volume to zero; Unmute restores a known earlier level. If no restore level is known, use + or the amp remote.',y)
y=item(5,'X closes only the volume popup','While it is open, rack and playback controls are blocked. Volume changes do not pause, skip or replace the music.',y)
finish(4)

# 5 settings
heading('06  /  ORGANISE','Settings','Use the Settings spine in Rack, or the fixed Settings button in Carousel.')
rect(48,190,330,276,HexColor('#252720'),HexColor('#494c3e'),9)
text('Settings',69,222,17,white);button('X',328,202,30,30,size=14)
text('Display mode',69,245,9,white);button('Rack / Carousel',69,252,287,26,size=9)
text('CD size',69,296,9,white);line(78,310,340,310,HexColor('#bcb7a6'),3)
c.setFillColor(GOLD);c.circle(158,H-310,6,fill=1,stroke=0)
text('Sort by',69,337,9,white);button('Artist name',69,344,159,26,size=9);button('Refresh Rack',237,344,120,26,size=9)
text('Denon - selected output',69,393,9,white);button('Change output device',69,401,177,26,size=9)
text('NAS connection information',69,450,9,HexColor('#bcb7a6'))
call(1,410,266,356,266);call(2,410,310,343,310);call(3,410,357,356,357);call(4,410,415,247,415);call(5,410,450,265,448);call(6,410,214,357,217)
text('Illustration: NAS Settings. Demo shows Exit Demo instead of an output chooser.',48,485,9,MUTED)
y=509
y=item(1,'Display mode','Choose Rack or Carousel. The display changes immediately.',y)
y=item(2,'CD size','Adjust the case size. Larger cases leave fewer spines on screen.',y)
y=item(3,'Sort by, then Refresh Rack','Choose Artist name, Album name or Album date. Refresh Rack applies the choice.',y)
y=item(4,'Change output device','Pick an amplifier, then Open rack. Demo has Exit Demo instead.',y)
y=item(5,'NAS information and refreshing','Refresh Rack finds indexed uploads / deletions without changing playback.',y)
y=item(6,'X closes Settings','Mode, size and applied sort are remembered per browser, separately for Demo.',y)
finish(5)

# Demo
heading('07  /  TRY IT','Demo mode and sharing','Explore the interface without a NAS or amplifier. The public website offers Demo only.')
rect(48,192,499,114,PALE,r=8)
text('Public demo',64,218,12,GREEN,True)
text('https://cd-rack-showcase.vercel.app',64,247,16,INK,True)
para('Open this address, then tap Demo. No username, password or NAS connection is needed.',64,263,465,11)
c.linkURL('https://cd-rack-showcase.vercel.app',(61,H-255,500,H-230),relative=0)
text('On the NAS login screen',48,345,16,INK,True)
para('Tap <b>Demo</b> instead of Sign in to try 97 synthetic sample albums. This does not stop or change any music already playing on the real amplifier.',48,360)
y=428
y=item(1,'Try Rack and Carousel','Browse cases, open covers, change CD size and sort the samples. Some sample albums use multi-disc fatboxes.',y)
y=item(2,'Play without sound','Play/Pause, Previous/Next and Now Playing simulate a local amplifier. Playing demo tracks advance every 30 seconds. No audio is produced.',y)
y=item(3,'Try volume and mute','The V popup changes a simulated level only. It never contacts or changes your real amplifier.',y)
y=item(4,'Exit Demo','Open Settings and tap Exit Demo. On the NAS version you can then sign in; the public website returns to its Demo-only welcome screen.',y)
note('Separate preferences','Demo remembers its own display mode, size, sort and position in this browser. It does not overwrite the preferences used for your NAS albums.',715,62)
finish(6)

# 6 tech
heading('08  /  TECHNICAL SETUP','System requirements','For real music: a Synology NAS, a Denon amplifier and a phone or tablet on the same home network. Demo needs only a browser.')
for x,w,title,body in [(48,143,'Phone / tablet','Browser running\nHome Music'),(226,143,'Synology NAS','Home Music service\nAudio Station + music'),(404,143,'Denon amplifier','Network player\nSpeakers connected')]:
    rect(x,182,w,76,PALE,r=8);text(title,x+12,205,12,GREEN,True)
    for j,t in enumerate(body.split('\n')):text(t,x+12,227+j*15,9,INK)
line(192,220,223,220);line(370,220,401,220)
text('HTTP',195,210,7,GREEN);text('DLNA',373,210,7,GREEN)
para('The browser sends commands. Audio Station controls the amp and supplies the music; audio does not pass through the phone or tablet.',48,275,499,10)
y=326;text('NAS',48,y,15,INK,True);y+=13
for b in [
    '<b>DSM:</b> Synology\'s management software, with the user home service enabled.',
    '<b>Node.js:</b> Version 22 or later to run Home Music.',
    '<b>Thumbnail support:</b> The NAS ImageMagick convert tool caches Carousel covers; original images are the fallback if conversion is unavailable.',
    '<b>Audio Station:</b> Installed and running, with your music folders indexed (scanned into its library).',
    '<b>DSM account:</b> Permission to use Audio Station and control DLNA/UPnP players.',
    '<b>Home Music:</b> The deployed app service and an enabled <b>Home Music PWA</b> boot-up task.',
    '<b>Music files:</b> Album, artist, disc and track tags; date tags and cover artwork improve the rack.'
]: y=bullet(b,y)
y+=15;text('Amplifier',48,y,15,INK,True);y+=13
for b in [
    '<b>Network player:</b> A DLNA/UPnP renderer that Audio Station can discover and control.',
    '<b>Controls:</b> Play, pause, track changes and volume setting through Audio Station; HEOS is not required for Home Music volume.',
    '<b>Audio support:</b> Playback of the music formats supplied by the NAS, with speakers connected.'
]: y=bullet(b,y)
y+=15;text('Phone / tablet and home network',48,y,15,INK,True);y+=13
for b in [
    '<b>Browser and Wi-Fi:</b> A current browser on the same home network as the NAS and amp.',
    '<b>Protocols and ports:</b> HTTP on TCP <b>8787</b> for Home Music; the service uses DSM/Audio Station on <b>5000</b> in this setup. Allow DLNA/UPnP discovery and control.',
    '<b>Local name:</b> mDNS must resolve <b>[YourNASName].local</b> to the NAS.'
]: y=bullet(b,y)
note('Example hardware','Synology 218j NAS + Denon AVR-2400x amplifier.',y+8,52)
finish(6)

# 7: installation checklist
heading('09  /  TECHNICAL SETUP','Installation to-do list','For the person setting up or maintaining the app. These steps follow the existing NAS-hosted arrangement; they are not needed for everyday listening.')
y=182
for n,title,body in [
    (1,'Connect and switch on','Put the NAS, amplifier and phone or tablet on the same home network. Check that the NAS and amp can see each other.'),
    (2,'Prepare the NAS','Install Node.js 22 or later and Audio Station. Enable the DSM user home service. Add the music folders to Audio Station and let indexing finish.'),
    (3,'Check account and amplifier access','Give your DSM account permission to use Audio Station and DLNA/UPnP players. Confirm that Audio Station can find and control the Denon before installing Home Music.'),
    (4,'Set up deployment access once','On the PC, use <b>connect-nas.ps1</b> with the current NAS address and your deployment account. Enable SSH on the NAS, use the dedicated deployment key and verify the host key. Never save a DSM password in scripts or documents.'),
    (5,'Deploy Home Music','From the app folder on the PC, run <b>deploy-nas.ps1</b> with the current NAS address and deployment account. It runs tests, uploads the release, restarts the service and checks its health. Confirm that the health check passes.'),
    (6,'Enable automatic startup','In DSM Task Scheduler, enable the <b>Home Music PWA</b> boot-up task under the deployment account. Use the exact startup command printed by the installer. Run the task, then verify access after a NAS reboot.'),
    (7,'Check access in the browser','Allow TCP 8787 from the home LAN if DSM firewall requires it. Open <b>http://[YourNASName].local:8787</b> in the PC browser, replacing the placeholder with your NAS name. Confirm the app loads.'),
    (8,'Connect the phone or tablet','Open the same address, sign in, choose the Denon and open the rack. Check artwork and controls. Tap Play only when ready to test music, then check volume at a comfortable level.'),
    (9,'Save the address','Bookmark the app. After music uploads or deletions are indexed, use Settings > Refresh Rack. Expect to sign in again after an app service restart or update.')
]: y=todo(n,title,body,y)
assert y<780,('Checklist overflow',y)
finish(7)

# Sessions
heading('10  /  CONNECTION','Staying signed in','Home Music now keeps an app login for up to 30 days without browser activity.')
for x,w,title,body in [(48,146,'Sign in once','Persistent browser cookie'),(224,146,'Return and use it','Idle period renews'),(400,147,'30 days unused','Fresh sign-in needed')]:
    rect(x,192,w,92,PALE,r=8);text(title,x+10,220,12,GREEN,True);para(body,x+10,234,w-20,10)
line(195,239,221,239);line(373,239,397,239)
y=322
y=item(1,'You can close the browser','The login cookie is persistent, so closing and reopening the browser should not by itself sign you out. Normal browser use renews the 30-day inactivity period.',y)
y=item(2,'The NAS session stays active quietly','A read-only Audio Station check helps keep the NAS session alive after about five minutes without NAS activity, including while the browser is closed. It does not alter playback, volume or queues.',y)
y=item(3,'Some events still require sign-in','An app deployment, service restart or NAS reboot clears in-memory sessions. DSM can also revoke a session. Use your DSM login again when prompted.',y)
y=item(4,'Passwords are never saved','Home Music retains session information in service memory, not your DSM password. Clearing browser cookies or switching browser profiles also requires sign-in.',y)
note('No setup change needed','Sign in normally to receive the longer-lived cookie. The public Demo has no NAS login or session to maintain.',699,72)
finish(9)

# Help
heading('11  /  HELP','If something needs attention','Start with these checks. Connection problems often come from a device being off, a revoked sign-in or a different network.')
y=188
for title,body in [
 ('The app will not open','Check your home Wi-Fi, that the NAS is on, and that <b>http://[YourNASName].local:8787</b> uses your actual NAS name, without brackets. Guest Wi-Fi can isolate devices. If the name will not resolve, ask the setup owner to check the current NAS address, mDNS and the app service. Do not rely on an old IP address.'),
 ('Sign-in fails or is requested again','Use the DSM account and current verification code, if required. Ask the setup owner to check Audio Station permissions. Signing in again after an app service restart or update is expected.'),
 ('The Denon is missing, or there is no sound','Turn the amp on and check its network connection. Use <b>Change output device</b>, then <b>Find devices again</b>. Choose the correct output, check mute and volume, open a real album and tap Play. Check whether Audio Station itself can control the Denon.'),
 ('An album is missing or looks wrong','Let Audio Station finish indexing music, then use <b>Settings > Refresh Rack</b>. An empty NAS shows No albums found with Settings and Now Playing still available. Covers show Loading artwork while fetching; generated art appears only if real artwork fails. Demo samples appear only in Demo.'),
 ('Volume is unavailable or will not unmute','Close and reopen V so the app reads the amp again. If an error remains, check Audio Station control or use the amp remote. When no previous volume is known, the app will not guess an unmute level; use + or the remote.')]:
    text(title,48,y,12,INK,True);y=para(body,48,y+10,499,10)+25
note('About the PWA name','PWA means Progressive Web App. The NAS setup uses HTTP, so normal installation and offline PWA features are unavailable there; use a bookmark. The public Demo uses HTTPS and can offer browser installation where supported. Demo still produces no audio.',y-2,88)
y+=105
para('<b>For the setup owner:</b> Check the NAS service, the Home Music PWA boot task and any DSM firewall rule allowing port 8787 from the home LAN. Keep access within the home network; router port forwarding is not part of this setup.',48,y,499,9)
finish(8)
c.save()
reader=PdfReader(str(OUT))
assert len(reader.pages)==12
assert '[YourNASName]' in ''.join(page.extract_text() for page in reader.pages)
assert 'kept simple' not in ''.join(page.extract_text() for page in reader.pages)
for i,page in enumerate(reader.pages,1):
    extracted=page.extract_text()
    assert len(extracted)>(200 if i==1 else 400),(i,len(extracted))
    print(f'Page {i}: {len(extracted)} text characters')
print(OUT)
