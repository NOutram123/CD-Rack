# CD Rack Guide

The illustrated user guide is in `CD-Rack-Guide.pdf`. It covers Rack, Carousel,
Demo mode, playback, volume, 30-day sessions, the NAS requirements and installation.

To regenerate it from the repository root:

```sh
python -m pip install -r docs/requirements.txt
python docs/build_user_guide.py
```

The generated file is `output/pdf/Home-Music-User-Guide.pdf`. Copy it to
`docs/CD-Rack-Guide.pdf` when publishing a new guide. The generator uses Arial
on Windows, DejaVu Sans on Linux when available, or built-in Helvetica.
The cover screenshot is in `assets/cover.png`; the annotated interface diagrams
are drawn by the generator.
