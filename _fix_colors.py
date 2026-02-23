import re

with open('js/callsheet.js', 'r') as f:
    content = f.read()

color_map = {
    '"#dc3545"': 'CS_COLORS.red',
    '"#ffc107"': 'CS_COLORS.yellow',
    '"#fd7e14"': 'CS_COLORS.orange',
    '"#28a745"': 'CS_COLORS.green',
    '"#6f42c1"': 'CS_COLORS.purple',
    '"#17a2b8"': 'CS_COLORS.teal',
    '"#6c757d"': 'CS_COLORS.gray',
}

front_start = content.index('const CALLSHEET_FRONT = [')
back_end = content.index('const CALLSHEET_CATEGORIES = ')

section = content[front_start:back_end]
count = 0
for hex_str, cs_ref in color_map.items():
    old_pattern = 'color: ' + hex_str
    new_pattern = 'color: ' + cs_ref
    n = section.count(old_pattern)
    count += n
    section = section.replace(old_pattern, new_pattern)

content = content[:front_start] + section + content[back_end:]
with open('js/callsheet.js', 'w') as f:
    f.write(content)

print('Replaced ' + str(count) + ' hardcoded color references with CS_COLORS constants')
