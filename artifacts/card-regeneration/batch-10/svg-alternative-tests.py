"""Cardinal-number presentation and saved geometry checks for #72."""
import json
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET
from number_badges import display_label, badge_color

ROOT = Path(__file__).resolve().parents[2]


class NumberBadgeTests(unittest.TestCase):
    def test_compact_labels_preserve_value(self):
        expected = {16:'16',500:'500',1000:'1K',2000:'2K',4000:'4K',10000:'10K',20000:'20K',100000:'100K',1000000:'1M',1500:'1.5K',1500000:'1.5M'}
        for value,label in expected.items():
            self.assertEqual(display_label(value), label)
        self.assertEqual(badge_color(1000), badge_color(9999))
        self.assertNotEqual(badge_color(1000), badge_color(10000))
        self.assertEqual(badge_color(10000), badge_color(1000000))

    def test_every_cardinal_has_a_circle_and_centered_font_independent_lettering(self):
        folder = ROOT / 'artifacts/card-regeneration/batch-10'
        spec = json.loads((folder/'svg-number-spec.json').read_text())
        self.assertEqual(len(spec['entries']), 24)
        for entry in spec['entries']:
            svg = ET.fromstring((ROOT/entry['sourceSvgPath']).read_text())
            self.assertEqual(svg.attrib['data-label'], display_label(entry['value']))
            ns = {'svg':'http://www.w3.org/2000/svg'}
            self.assertEqual(svg.findall('.//svg:ellipse', ns), [])
            self.assertEqual(svg.findall('.//svg:text', ns), [])
            outline = next(n for n in svg.findall('svg:circle', ns) if n.attrib.get('data-role') == 'outline')
            self.assertEqual(outline.attrib['cx'], outline.attrib['cy'])
            self.assertNotIn('transform', outline.attrib)
            self.assertEqual(outline.attrib['r'], '108')
            letter = next(n for n in svg.findall('svg:path', ns) if n.attrib.get('data-role') == 'lettering')
            self.assertTrue(letter.attrib['d'])

    def test_prior_approved_cards_remain_selected_until_revisions_are_accepted(self):
        manifest = json.loads((ROOT/'artifacts/card-regeneration/batch-10/manifest.json').read_text())
        revisions = manifest.get('referenceRevisions', [])
        self.assertLessEqual({r['number'] for r in revisions}, {83,84,85,86,87})
        for candidate in revisions:
            self.assertEqual(candidate['status'], 'awaiting-user-feedback')
            original = json.loads((ROOT/candidate['revisesManifest']).read_text())
            approved = next(a for a in original['assets'] if a['id'] == candidate['id'])
            self.assertEqual(approved['status'], 'approved')
            self.assertEqual(approved['path'], candidate['approvedSourcePath'])
            self.assertNotEqual(approved['path'], candidate['path'])


if __name__ == '__main__':
    unittest.main()
