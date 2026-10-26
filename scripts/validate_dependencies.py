#!/usr/bin/env python3
"""
Validate dependencies in DeepTime documentation.
Scans all .md files in the catalogs, extracts elements (### headers),
and checks for 'Входящие связи' / 'Исходящие связи' sections.

Outputs:
- Total elements per catalog
- Elements with links
- Elements without links (hanging)
- Detailed list of hanging elements
"""

import os
import re
import json
from pathlib import Path
from collections import defaultdict

REPO_ROOT = Path("/home/z/my-project/DeepTime")

# Directories to scan
CATALOG_DIRS = [
    ("resources", REPO_ROOT / "docs/ai/02_world/resources"),
    ("processed_materials", REPO_ROOT / "docs/ai/02_world/processed_materials"),
    ("soils", REPO_ROOT / "docs/ai/02_world/soils"),
    ("flora", REPO_ROOT / "docs/ai/02_world/flora"),
    ("fauna", REPO_ROOT / "docs/ai/02_world/fauna"),
    ("items", REPO_ROOT / "docs/ai/06_technology/items"),
]

# Technology files (single files, not directories)
TECH_FILES = [
    ("processes", REPO_ROOT / "docs/ai/06_technology/processes.md"),
    ("tech_tree", REPO_ROOT / "docs/ai/06_technology/tech_tree.md"),
    ("dependencies_graph", REPO_ROOT / "docs/ai/_meta/dependencies_graph.md"),
]

# Patterns to detect "links" sections
LINK_PATTERNS = [
    r'входящие\s+связи',
    r'исходящие\s+связи',
    r'входящие',
    r'исходящие',
    r'сырь[её]',
    r'процесс',
    r'применени',
    r'использ',
    r'где\s+используется',
    r'технологические\s+цепочки',
    r'альтернативы',
    r'→',  # arrow links
    r'\[.*\]\(.*\)',  # markdown links
]

def extract_elements(filepath):
    """Extract all ### level headers from a markdown file."""
    elements = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        return [], str(e)
    
    lines = content.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i]
        # Match ### headers (but not ####)
        if line.startswith('### ') and not line.startswith('####'):
            title = line[4:].strip()
            # Skip if it's a template/placeholder or a numbered sub-section (principles, tables, etc.)
            if title.startswith('Название') or title.startswith('Шаблон') or title.startswith('Пример'):
                i += 1
                continue
            # Skip numbered sub-sections like "1. Принцип...", "2. Без...", "3. Каолин..." — these are design notes, not elements
            if re.match(r'^\d+\.\s', title):
                i += 1
                continue
            
            # Collect the body (until next ### or ##)
            body_lines = []
            j = i + 1
            while j < len(lines):
                if lines[j].startswith('### ') or lines[j].startswith('## '):
                    break
                body_lines.append(lines[j])
                j += 1
            
            body = '\n'.join(body_lines)
            
            # Check for links
            has_incoming = False
            has_outgoing = False
            has_alternatives = False
            has_any_link = False
            
            # Check for explicit sections
            if re.search(r'входящие\s+связи', body, re.IGNORECASE):
                has_incoming = True
            if re.search(r'исходящие\s+связи', body, re.IGNORECASE):
                has_outgoing = True
            if re.search(r'альтернативы', body, re.IGNORECASE):
                has_alternatives = True
            
            # Check for ANY link pattern (markdown links, arrows, etc.)
            for pattern in LINK_PATTERNS:
                if re.search(pattern, body, re.IGNORECASE):
                    has_any_link = True
                    break
            
            elements.append({
                'title': title,
                'has_incoming': has_incoming,
                'has_outgoing': has_outgoing,
                'has_alternatives': has_alternatives,
                'has_any_link': has_any_link,
                'body_length': len(body),
            })
        i += 1
    
    return elements, None

def main():
    report = {
        'total_elements': 0,
        'with_explicit_links': 0,  # has_incoming OR has_outgoing
        'with_any_link': 0,  # has_any_link (includes implicit references)
        'hanging': 0,  # no links at all
        'by_catalog': {},
        'hanging_details': [],
    }
    
    # Scan catalog directories
    for catalog_name, catalog_dir in CATALOG_DIRS:
        if not catalog_dir.exists():
            report['by_catalog'][catalog_name] = {'error': f'Directory not found: {catalog_dir}'}
            continue
        
        catalog_elements = []
        for md_file in sorted(catalog_dir.glob('*.md')):
            if md_file.name == 'README.md':
                continue  # skip READMEs
            
            elements, err = extract_elements(md_file)
            if err:
                continue
            
            for el in elements:
                el['file'] = md_file.name
                catalog_elements.append(el)
        
        # Analyze
        total = len(catalog_elements)
        with_explicit = sum(1 for e in catalog_elements if e['has_incoming'] or e['has_outgoing'])
        with_any = sum(1 for e in catalog_elements if e['has_any_link'])
        hanging = total - with_any
        
        report['by_catalog'][catalog_name] = {
            'total': total,
            'with_explicit_links': with_explicit,
            'with_any_link': with_any,
            'hanging': hanging,
            'hanging_elements': [e for e in catalog_elements if not e['has_any_link']],
        }
        
        report['total_elements'] += total
        report['with_explicit_links'] += with_explicit
        report['with_any_link'] += with_any
        report['hanging'] += hanging
        
        for e in catalog_elements:
            if not e['has_any_link']:
                report['hanging_details'].append({
                    'catalog': catalog_name,
                    'file': e['file'],
                    'title': e['title'],
                })
    
    # Scan tech files
    for tech_name, tech_file in TECH_FILES:
        if not tech_file.exists():
            continue
        
        elements, err = extract_elements(tech_file)
        if err:
            continue
        
        # Add 'file' key for consistency
        for e in elements:
            e['file'] = tech_file.name
        
        total = len(elements)
        with_explicit = sum(1 for e in elements if e['has_incoming'] or e['has_outgoing'])
        with_any = sum(1 for e in elements if e['has_any_link'])
        hanging = total - with_any
        
        report['by_catalog'][f'tech:{tech_name}'] = {
            'total': total,
            'with_explicit_links': with_explicit,
            'with_any_link': with_any,
            'hanging': hanging,
            'hanging_elements': [e for e in elements if not e['has_any_link']],
        }
        
        report['total_elements'] += total
        report['with_explicit_links'] += with_explicit
        report['with_any_link'] += with_any
        report['hanging'] += hanging
        
        for e in elements:
            if not e['has_any_link']:
                report['hanging_details'].append({
                    'catalog': f'tech:{tech_name}',
                    'file': tech_file.name,
                    'title': e['title'],
                })
    
    # Print report
    print("=" * 80)
    print("DEPENDENCIES VALIDATION REPORT — DeepTime v0.8")
    print("=" * 80)
    print()
    print(f"Total elements checked: {report['total_elements']}")
    print(f"With explicit links (Входящие/Исходящие связи): {report['with_explicit_links']} ({report['with_explicit_links']*100//max(1,report['total_elements'])}%)")
    print(f"With ANY link (implicit or explicit): {report['with_any_link']} ({report['with_any_link']*100//max(1,report['total_elements'])}%)")
    print(f"HANGING (no links at all): {report['hanging']} ({report['hanging']*100//max(1,report['total_elements'])}%)")
    print()
    print("-" * 80)
    print("BY CATALOG:")
    print("-" * 80)
    
    for catalog, data in report['by_catalog'].items():
        if 'error' in data:
            print(f"  {catalog}: ERROR — {data['error']}")
            continue
        
        pct_explicit = data['with_explicit_links']*100//max(1,data['total'])
        pct_any = data['with_any_link']*100//max(1,data['total'])
        status = "✅" if data['hanging'] == 0 else "⚠️"
        print(f"  {status} {catalog}:")
        print(f"     Total: {data['total']}, Explicit links: {data['with_explicit_links']} ({pct_explicit}%), Any link: {data['with_any_link']} ({pct_any}%), Hanging: {data['hanging']}")
        
        if data['hanging'] > 0:
            print(f"     Hanging elements:")
            for el in data['hanging_elements'][:10]:  # show first 10
                print(f"       — {el['title']} ({el['file']})")
            if len(data['hanging_elements']) > 10:
                print(f"       ... and {len(data['hanging_elements'])-10} more")
    
    print()
    print("-" * 80)
    print("SUMMARY:")
    print("-" * 80)
    if report['hanging'] == 0:
        print("✅ ALL elements have at least one link! No hanging elements.")
    else:
        print(f"⚠️  {report['hanging']} hanging elements found. See details above.")
    
    print()
    
    # Recommendations
    print("-" * 80)
    print("RECOMMENDATIONS:")
    print("-" * 80)
    print("1. For elements with NO links → add 'Входящие связи' and 'Исходящие связи' sections")
    print("2. For elements with implicit links (but no explicit section) → formalize into sections")
    print("3. After fixing → re-run this script to verify")
    print()
    
    # Save JSON report
    output_path = REPO_ROOT / "docs/ai/_meta/validation_log.md"
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("---\n")
        f.write("статус: ACTIVE\n")
        f.write("дата_обновления: 2026-10-25\n")
        f.write("тип: VALIDATION_LOG\n")
        f.write("---\n\n")
        f.write("# Validation Log — Валидация связей (Принцип 11)\n\n")
        f.write("> Результат валидации связей между элементами каталогов. Проверяется наличие входящих и исходящих связей у каждого элемента.\n\n")
        f.write("---\n\n")
        f.write(f"## Валидация от 2026-10-25 (v0.8)\n\n")
        f.write(f"**Всего элементов проверено**: {report['total_elements']}\n\n")
        f.write(f"| Метрика | Значение | % |\n")
        f.write(f"|---|---|---|\n")
        f.write(f"| С явными разделами «Связи» | {report['with_explicit_links']} | {report['with_explicit_links']*100//max(1,report['total_elements'])}% |\n")
        f.write(f"| С любой ссылкой (implicit) | {report['with_any_link']} | {report['with_any_link']*100//max(1,report['total_elements'])}% |\n")
        f.write(f"| Висящие (без связей) | {report['hanging']} | {report['hanging']*100//max(1,report['total_elements'])}% |\n\n")
        f.write("### По каталогам\n\n")
        f.write("| Каталог | Всего | Явные связи | Любые ссылки | Висящие | Статус |\n")
        f.write("|---|---|---|---|---|---|\n")
        for catalog, data in report['by_catalog'].items():
            if 'error' in data:
                f.write(f"| {catalog} | ERROR | — | — | — | ❌ |\n")
                continue
            status = "✅" if data['hanging'] == 0 else "⚠️"
            f.write(f"| {catalog} | {data['total']} | {data['with_explicit_links']} | {data['with_any_link']} | {data['hanging']} | {status} |\n")
        f.write("\n")
        
        if report['hanging'] > 0:
            f.write("### Висящие элементы (детально)\n\n")
            f.write("| Каталог | Файл | Элемент |\n")
            f.write("|---|---|---|\n")
            for el in report['hanging_details']:
                f.write(f"| {el['catalog']} | {el['file']} | {el['title']} |\n")
            f.write("\n")
        
        f.write("### Рекомендации\n\n")
        f.write("1. Для элементов без связей → добавить разделы «Входящие связи» и «Исходящие связи»\n")
        f.write("2. Для элементов с неявными ссылками → формализовать в разделы\n")
        f.write("3. После исправления → запустить скрипт повторно\n\n")
        f.write("### Скрипт валидации\n\n")
        f.write("- **Файл**: `/home/z/my-project/scripts/validate_dependencies.py`\n")
        f.write("- **Запуск**: `python3 scripts/validate_dependencies.py`\n")
        f.write("- **Результат**: обновляет этот файл + выводит в консоль\n")
    
    print(f"Validation log saved to: {output_path}")
    print()
    print("=" * 80)
    
    return report

if __name__ == '__main__':
    main()
