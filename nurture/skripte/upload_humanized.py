import os
import json, re, urllib.request, base64, time, html as html_mod

BASE = 'https://mautic.hl-support.biz/api'
# 🔴 Zugangsdaten kommen aus der Umgebung, NIE aus dem Quelltext.
# Bis zum 28.08.2026 stand hier das Mautic-admin-Passwort im Klartext.
# Fail-closed: ohne MAUTIC_PASS bricht das Skript ab, statt mit leerem Passwort
# gegen die Produktion zu laufen.
MAUTIC_USER = os.environ.get("MAUTIC_USER", "admin")
MAUTIC_PASS = os.environ.get("MAUTIC_PASS", "").strip()
if not MAUTIC_PASS:
    raise SystemExit("MAUTIC_PASS fehlt - Umgebungsvariable setzen, kein Passwort im Quelltext.")
AUTH = base64.b64encode(f"{MAUTIC_USER}:{MAUTIC_PASS}".encode()).decode()
H = {'Authorization': f'Basic {AUTH}', 'Content-Type': 'application/json'}

ACCENTS = {
    'feuer': ('#D45B40', '#FFFFFF'),
    'wind':  ('#C9A84C', '#1A1A1A'),
    'wasser':('#2E9F6B', '#FFFFFF'),
    'fels':  ('#4F8ECB', '#FFFFFF'),
}
DEFAULT_ACCENT = ('#C9A84C', '#1A1A1A')

PROFILE_ACCENTS = {}
for base_id, group in [
    (21, ['feuer','wind','wasser','fels']),
    (26, ['feuer','wind','wasser','fels']),
    (30, ['feuer','wind','wasser','fels']),
    (35, ['feuer','wind','wasser','fels']),
    (118, ['feuer','wind','wasser','fels']),
    (122, ['feuer','wind','wasser','fels']),
    (150, ['feuer','wind','wasser','fels']),
    (134, ['feuer','wind','wasser','fels']),
    (138, ['feuer','wind','wasser','fels']),
    (64, ['feuer','wind','wasser','fels']),
    (69, ['feuer','wind','wasser','fels']),
    (79, ['feuer','wind','wasser','fels']),
    (89, ['feuer','wind','wasser','fels']),
]:
    for i, key in enumerate(group):
        PROFILE_ACCENTS[base_id + i] = key

def mautic(method, path, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(f'{BASE}{path}', data=body, headers=H, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.request.HTTPError as e:
        return {'error': e.read().decode()[:400]}

def bulletproof_btn(url, label, accent, btn_text):
    return (
        f'<div style="margin:0 0 28px 0;text-align:center;">'
        f'<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">'
        f'<tr><td align="center" bgcolor="{accent}" style="border-radius:14px;background:{accent};">'
        f'<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{url}" '
        f'style="height:50px;v-text-anchor:middle;width:380px;" arcsize="14%" stroke="f" fillcolor="{accent}">'
        f'<w:anchorlock/><center style="color:{btn_text};font-family:Arial,sans-serif;font-size:16px;font-weight:700;">{label}</center>'
        f'</v:roundrect><![endif]-->'
        f'<!--[if !mso]><!-- -->'
        f'<a href="{url}" style="background:{accent};border:1px solid {accent};border-radius:14px;color:{btn_text};'
        f'display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;'
        f'min-width:300px;padding:14px 32px;text-align:center;text-decoration:none;white-space:nowrap;-webkit-text-size-adjust:none;">{label}</a>'
        f'<!--<![endif]--></td></tr></table></div>'
    )

COACH_LABELS = {
    'de': ('Dein Ansprechpartner', 'Telefon / WhatsApp', 'E-Mail'),
    'it': ('La tua persona di contatto', 'Telefono / WhatsApp', 'Email'),
    'en': ('Your contact', 'Phone / WhatsApp', 'Email'),
    'fr': ('Votre interlocuteur', 'Téléphone / WhatsApp', 'E-mail'),
    'ru': ('Ваш контакт', 'Телефон / WhatsApp', 'Эл. почта'),
}

def coach_block(accent, lang='de'):
    lbl_contact, lbl_phone, lbl_email = COACH_LABELS.get(lang, COACH_LABELS['de'])
    return (
        f'<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:24px 0 0 0;border-collapse:separate;">'
        f'<tr><td bgcolor="#F7F3EA" style="background-color:#F7F3EA;border:1px solid #E7DFC9;border-radius:18px;padding:20px 20px 18px 20px;">'
        f'<div style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;letter-spacing:2px;text-transform:uppercase;color:#7A6C52;font-weight:700;">{lbl_contact}</div>'
        f'<div style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.3;font-weight:700;color:#1A1A1A;">{{contactfield=ac_berater_vorname}} {{contactfield=ac_berater_name}}</div>'
        f'<div style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#2D2D2D;"><strong>{lbl_phone}:</strong> {{contactfield=ac_berater_whatsapp}}</div>'
        f'<div style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#2D2D2D;"><strong>{lbl_email}:</strong> <a href="mailto:{{contactfield=ac_berater_email}}" style="color:{accent};text-decoration:underline;">{{contactfield=ac_berater_email}}</a></div>'
        f'</td></tr></table>'
    )

def p(text, first=False):
    margin = "0 0 14px 0" if first else "0 0 16px 0"
    return f'<p style="margin:{margin};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;">{text}</p>'

def preprocess(text):
    text = text.strip()
    text = re.sub(r'^(Hallo|Ciao|Hi) \{contactfield=firstname\},\s*\n+', '', text)
    text = re.sub(r'\n+\{contactfield=ac_berater_vorname\}\n+', '\n\n', text)
    text = re.sub(r'\n+\{contactfield=ac_berater_vorname\}\s*$', '', text.rstrip())
    return text.strip()

ORG = '{contactfield=ac_berater_org_display}'

SIGNOFF = {
    'de': f'Dein {ORG} Team',
    'it': f'Il tuo team {ORG}',
    'en': f'Your team {ORG}',
    'fr': f'Ton équipe {ORG}',
    'ru': f'Твоя команда {ORG}',
}

GREETING = {
    'de': 'Hallo {contactfield=firstname},',
    'it': 'Ciao {contactfield=firstname},',
    'en': 'Hi {contactfield=firstname},',
    'fr': 'Bonjour {contactfield=firstname},',
    'ru': 'Привет, {contactfield=firstname},',
}

_SLUG = '{contactfield=ac_berater_slug}'
_SIGNUP_LINK = f'<a href="https://business.activecenter.info/{_SLUG}" style="color:#999999;text-decoration:underline;">business.activecenter.info/{_SLUG}</a>'

FOOTER = {
    'de': (f'Du erhältst diese Mail weil du dich auf {_SIGNUP_LINK} eingetragen hast.',
           'Abmelden', 'Impressum &amp; Datenschutz'),
    'it': (f'Ricevi questa email perché ti sei registrato su {_SIGNUP_LINK}.',
           'Annulla iscrizione', 'Note legali &amp; Privacy'),
    'en': (f'You are receiving this email because you signed up at {_SIGNUP_LINK}.',
           'Unsubscribe', 'Imprint &amp; Privacy'),
    'fr': (f'Vous recevez cet e-mail car vous vous êtes inscrit sur {_SIGNUP_LINK}.',
           'Se désabonner', 'Mentions légales &amp; Confidentialité'),
    'ru': (f'Вы получили это письмо, потому что зарегистрировались на {_SIGNUP_LINK}.',
           'Отписаться', 'Правовая информация &amp; Конфиденциальность'),
}

def detect_lang(name):
    # robust: language code as a standalone token anywhere in the name
    # (handles "IT - A2 - Freedom" AND "AC Nurture IT - A2 - Freedom")
    tokens = re.split(r'[\s\-]+', (name or '').strip().upper())
    if 'IT' in tokens: return 'it'
    if 'EN' in tokens: return 'en'
    if 'FR' in tokens: return 'fr'
    if 'RU' in tokens: return 'ru'
    return 'de'

def build_html(raw_text, accent_key=None, lang='de'):
    accent, btn_text = ACCENTS.get(accent_key, DEFAULT_ACCENT)

    cta_match = re.search(r'\n\nCTA: (.+?) \| (.+?)$', raw_text, re.MULTILINE)
    if cta_match:
        cta_label = cta_match.group(1).strip()
        cta_url = cta_match.group(2).strip()
        body_text = raw_text[:cta_match.start()].strip()
    else:
        cta_label = None
        cta_url = None
        body_text = raw_text.strip()

    body_text = body_text.rstrip()
    has_manual_signoff = body_text.endswith('{contactfield=ac_berater_vorname}')
    if has_manual_signoff:
        body_text = body_text[:body_text.rfind('\n{contactfield=ac_berater_vorname}')].strip()

    paragraphs = [chunk.strip() for chunk in body_text.split('\n\n') if chunk.strip()]

    body_parts = []
    body_parts.append(p(GREETING.get(lang, GREETING['de']), first=True))

    for para in paragraphs:
        body_parts.append(p(para.replace('\n', '<br>')))

    if cta_url and cta_label:
        body_parts.append(bulletproof_btn(cta_url, cta_label, accent, btn_text))

    body_parts.append(p(SIGNOFF.get(lang, SIGNOFF['de'])))
    body_parts.append(coach_block(accent, lang))

    body_html = '\n'.join(body_parts)

    footer_intro, footer_unsub, footer_legal = FOOTER.get(lang, FOOTER['de'])

    return f'''<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head><meta name="viewport" content="width=device-width,initial-scale=1.0"/><meta http-equiv="Content-Type" content="text/html;charset=UTF-8"/><title></title>
<style>body{{width:100%;margin:0;font-family:Arial,Helvetica,sans-serif;}}td{{word-break:break-word;font-family:Arial,Helvetica,sans-serif;font-size:16px;}}p{{margin:0 0 18px 0;font-size:16px;line-height:1.65;color:#2d2d2d;}}p:last-child{{margin-bottom:0;}}a{{color:#212529;text-decoration:underline;}}.content-cell{{padding:36px 40px;}}.email-footer p{{color:#999999;font-size:12px;line-height:1.6;}}.email-footer a{{color:#999999;text-decoration:underline;}}blockquote{{border-left:3px solid {accent};padding-left:16px;margin:18px 0;font-style:italic;color:#555;}}</style>
</head><body style="margin:0;padding:0;background-color:#f0f0f0;" bgcolor="#f0f0f0">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0f0f0"><tr><td align="center" style="padding:24px 8px;">
<table width="570" cellpadding="0" cellspacing="0" style="border-radius:4px 4px 0 0;overflow:hidden;"><tr><td bgcolor="#212529" style="padding:16px 24px;border-radius:4px 4px 0 0;">
<img src="https://hl-support.biz/storage/images/cwemaillogo-1bcb4f.png" width="180" alt="Activecenter" style="display:block;border:0;height:auto;width:180px;"/></td></tr></table>
<table width="570" cellpadding="0" cellspacing="0" bgcolor="#ffffff">
<tr><td class="content-cell" style="padding:36px 40px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;">
{body_html}
</td></tr></table>
<table class="email-footer" width="570" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 40px 32px 40px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#999999;text-align:center;">
<p style="margin:0 0 8px 0;font-size:12px;color:#999999;">{footer_intro}</p>
<p style="margin:0 0 8px 0;font-size:12px;color:#999999;"><a href="{{unsubscribe_url}}" style="color:#999999;text-decoration:underline;">{footer_unsub}</a>&nbsp;&middot;&nbsp;<a href="https://impressum.hl-support.biz/privacy.html" style="color:#999999;text-decoration:underline;">{footer_legal}</a></p>
</td></tr></table>
</td></tr></table></body></html>'''

def parse_agent_file(filepath):
    with open(filepath, encoding='utf-8') as f:
        content = f.read()
    # Unescape HTML entities in case agent output &lt;strong&gt; instead of <strong>
    content = html_mod.unescape(content)
    # Remove markdown code fences
    content = re.sub(r'^```\w*\s*\n', '', content, flags=re.MULTILINE)
    content = re.sub(r'^```\s*$', '', content, flags=re.MULTILINE)

    parts = re.split(r'={3,} EMAIL (\d+) ={3,}', content)
    emails = {}
    i = 1
    while i < len(parts):
        eid = int(parts[i].strip())
        block = parts[i + 1].strip() if i + 1 < len(parts) else ''
        name_match = re.match(r'NAME:\s*(.+)', block)
        subject_match = re.search(r'SUBJECT:\s*(.+)', block)
        if name_match and subject_match:
            name = name_match.group(1).strip()
            subject = subject_match.group(1).strip()
            body = block[subject_match.end():].strip()
            emails[eid] = {'name': name, 'subject': subject, 'body': body}
        i += 2
    return emails

CONTENT_DIR = os.path.join(os.path.dirname(__file__), '..', 'email-content')

all_emails = {}
for fname in [
    os.path.join(CONTENT_DIR, 'humanized_phase_a.txt'),
    os.path.join(CONTENT_DIR, 'humanized_phase_b.txt'),
    os.path.join(CONTENT_DIR, 'humanized_phase_c.txt'),
    os.path.join(CONTENT_DIR, 'humanized_phase_d.txt'),
    os.path.join(CONTENT_DIR, 'humanized_evergreen.txt'),
    os.path.join(CONTENT_DIR, 'humanized_IT.txt'),
    os.path.join(CONTENT_DIR, 'humanized_IT_followups.txt'),
    os.path.join(CONTENT_DIR, 'humanized_EN.txt'),
    os.path.join(CONTENT_DIR, 'humanized_EN_followups.txt'),
]:
    parsed = parse_agent_file(fname)
    all_emails.update(parsed)
    print(f'  {fname.split(chr(92))[-1]}: {len(parsed)} emails')

print(f'Total loaded: {len(all_emails)} email templates')

SKIP_IDS = {48}

ok = 0
fail = 0
skipped = 0

for eid in sorted(all_emails.keys()):
    if eid in SKIP_IDS:
        skipped += 1
        print(f'SKIP ID={eid:3d}  (deactivated)')
        continue

    email = all_emails[eid]
    accent_key = PROFILE_ACCENTS.get(eid, None)

    raw_body = preprocess(email['body'])
    lang = detect_lang(email['name'])
    html = build_html(raw_body, accent_key, lang)

    payload = {
        'subject': email['subject'],
        'customHtml': html,
        'fromName': '{contactfield=ac_berater_display_name}',
        'fromAddress': 'mail@mail.hl-support.biz',
        'replyToAddress': 'mail@mail.hl-support.biz',
    }

    r = mautic('PATCH', f'/emails/{eid}/edit', payload)

    if 'email' in r:
        ok += 1
        print(f'OK  ID={eid:3d}  [{accent_key or "gold":6s}]  {email["name"]}')
    else:
        fail += 1
        print(f'FAIL ID={eid:3d}  {email["name"]}: {r}')

    time.sleep(0.15)

print(f'\nDone: {ok} updated, {fail} failed, {skipped} skipped')
