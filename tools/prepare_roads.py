"""
prepare_roads.py
-----------------
Splits a raw OSM road export (e.g. from QGIS / osmconvert, Roads_WP.geojson)
into two web-friendly layers:

  1. roads.geojson            -> major road network (motorway..tertiary)
  2. pedestrian_paths.geojson -> footway/path/pedestrian/steps/cycleway/etc.

Why: a province-wide OSM road export commonly contains 50,000-100,000+
features once every residential street and footpath is included, which is
too heavy to parse client-side in a browser with Leaflet. This script keeps
the road hierarchy that matters for a public safety map and drops simplified
geometry + reduced coordinate precision to cut file size by ~15-20x with no
visible loss of detail at normal web map zoom levels (10-18).

Usage:
    pip install shapely --break-system-packages
    python3 prepare_roads.py /path/to/Roads_WP.geojson ./output_dir

Adjust MAJOR_CLASSES / PEDESTRIAN_CLASSES / tolerances below to taste.
"""

import json
import os
import sys
from shapely.geometry import shape, mapping
from shapely import simplify

MAJOR_CLASSES = {
    'motorway', 'motorway_link', 'trunk', 'trunk_link',
    'primary', 'primary_link', 'secondary', 'secondary_link',
    'tertiary', 'tertiary_link'
}

PEDESTRIAN_CLASSES = {
    'footway', 'path', 'pedestrian', 'steps', 'cycleway',
    'living_street', 'bridleway'
}

MAJOR_SIMPLIFY_TOLERANCE = 0.00008      # degrees, ~9m at the equator
PEDESTRIAN_SIMPLIFY_TOLERANCE = 0.00005  # degrees, ~5.5m
COORD_PRECISION = 5                      # decimal places (~1.1m)


def round_coords(coords, precision):
    if isinstance(coords[0], (int, float)):
        return [round(c, precision) for c in coords]
    return [round_coords(c, precision) for c in coords]


def simplify_features(features, tolerance):
    out = []
    for f in features:
        try:
            geom = shape(f['geometry'])
            simplified_geom = simplify(geom, tolerance, preserve_topology=True)
            f2 = dict(f)
            f2['geometry'] = mapping(simplified_geom)
            out.append(f2)
        except Exception:
            out.append(f)  # fall back to original geometry if simplify fails
    return out


def compact_precision(features, precision):
    for f in features:
        geom = f.get('geometry')
        if geom and geom.get('coordinates'):
            geom['coordinates'] = round_coords(geom['coordinates'], precision)
    return features


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    src_path = sys.argv[1]
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)

    with open(src_path) as f:
        data = json.load(f)

    all_features = data['features']
    print(f'Loaded {len(all_features)} features from {src_path}')

    major = [f for f in all_features if f['properties'].get('fclass') in MAJOR_CLASSES]
    ped = [f for f in all_features if f['properties'].get('fclass') in PEDESTRIAN_CLASSES]
    print(f'  Major road features:      {len(major)}')
    print(f'  Pedestrian path features: {len(ped)}')

    major = simplify_features(major, MAJOR_SIMPLIFY_TOLERANCE)
    ped = simplify_features(ped, PEDESTRIAN_SIMPLIFY_TOLERANCE)

    major = compact_precision(major, COORD_PRECISION)
    ped = compact_precision(ped, COORD_PRECISION)

    roads_out = os.path.join(out_dir, 'roads.geojson')
    ped_out = os.path.join(out_dir, 'pedestrian_paths.geojson')

    with open(roads_out, 'w') as f:
        json.dump({'type': 'FeatureCollection', 'features': major}, f, separators=(',', ':'))
    with open(ped_out, 'w') as f:
        json.dump({'type': 'FeatureCollection', 'features': ped}, f, separators=(',', ':'))

    print(f'Wrote {roads_out} ({os.path.getsize(roads_out) / 1024:.1f} KB)')
    print(f'Wrote {ped_out} ({os.path.getsize(ped_out) / 1024:.1f} KB)')


if __name__ == '__main__':
    main()
