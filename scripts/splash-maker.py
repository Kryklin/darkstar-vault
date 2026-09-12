from PIL import Image, ImageDraw, ImageFont
import math
import argparse
import sys

def hex_to_rgb(hex_str):
    """Converts a hex string (e.g. '#ffffff' or 'ffffff') to an RGB tuple."""
    hex_str = hex_str.lstrip('#')
    try:
        return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))
    except ValueError:
        print(f"Error: Invalid hex color code '{hex_str}'.")
        sys.exit(1)

def create_spinner_gif(
    input_path="logo.png",
    output_path="splash_installer.gif",
    canvas_size=(500, 650), 
    logo_size=(400, 400),
    spinner_color=(255, 255, 255),
    text_color=(255, 255, 255),
    bg_color=(0, 0, 0)
):
    try:
        print(f"Input: {input_path}")
        print(f"Output: {output_path}")
        print(f"Canvas: {canvas_size}, Logo: {logo_size}")
        print(f"Colors - Bg: {bg_color}, Text: {text_color}, Spinner: {spinner_color}")
        
        # 1. Load and Resize Logo (Keep Alpha Channel)
        try:
            logo = Image.open(input_path).convert("RGBA")
        except FileNotFoundError:
            print(f"Error: Could not find '{input_path}'. Make sure the file exists.")
            return

        logo = logo.resize(logo_size, Image.Resampling.LANCZOS)
        
        # 2. Setup Font
        try:
            # Arial for Windows, DejaVu for Linux/Mac
            font = ImageFont.truetype("arial.ttf", 30) 
        except IOError:
            try:
                font = ImageFont.truetype("DejaVuSans-Bold.ttf", 30)
            except IOError:
                font = ImageFont.load_default()
                print("Warning: Custom font not found, using default.")

        frames = []
        
        # Animation Settings
        total_frames = 30
        spinner_radius = 25
        spinner_center_x = canvas_size[0] // 2
        spinner_center_y = canvas_size[1] - 50 
        
        # Text Position ("INSTALLING" - no ellipsis)
        text = "INSTALLING"
        
        # Calculate text centering
        try:
            left, top, right, bottom = font.getbbox(text)
            text_w = right - left
            text_h = bottom - top
        except AttributeError:
            # Fallback for older Pillow versions
            text_w, text_h = font.getsize(text)
        
        text_x = (canvas_size[0] - text_w) // 2
        text_y = spinner_center_y - spinner_radius - text_h - 25

        # 3. Generate Frames
        for i in range(total_frames):
            # Create background canvas
            frame = Image.new("RGBA", canvas_size, bg_color)
            
            # Paste Logo (Centered horizontally, near top)
            # We use 'logo' as the mask argument to respect the PNG transparency
            logo_x = (canvas_size[0] - logo_size[0]) // 2
            logo_y = 20
            frame.paste(logo, (logo_x, logo_y), mask=logo)
            
            # Draw Text
            draw = ImageDraw.Draw(frame)
            draw.text((text_x, text_y), text, font=font, fill=text_color)
            
            # --- Draw High-Res Spinner ---
            # Supersampling: Draw 4x larger then resize down for smooth edges
            ss_factor = 4
            ss_size = (canvas_size[0] * ss_factor, canvas_size[1] * ss_factor)
            ss_layer = Image.new("RGBA", ss_size, (0, 0, 0, 0))
            ss_draw = ImageDraw.Draw(ss_layer)
            
            # Rotation math
            start_angle = (i * (360 / total_frames)) 
            end_angle = start_angle + 270 # 270 degree arc length
            
            sx = spinner_center_x * ss_factor
            sy = spinner_center_y * ss_factor
            sr = spinner_radius * ss_factor
            thickness = 6 * ss_factor
            
            ss_draw.arc(
                [sx - sr, sy - sr, sx + sr, sy + sr],
                start=start_angle,
                end=end_angle,
                fill=spinner_color,
                width=thickness
            )
            
            # Resize layer and composite
            ss_layer = ss_layer.resize(canvas_size, Image.Resampling.LANCZOS)
            frame.alpha_composite(ss_layer)
            
            # Convert to RGB (standard GIF format)
            frames.append(frame.convert("RGB"))

        # 4. Save GIF
        print(f"Generating GIF...")
        frames[0].save(
            output_path,
            save_all=True,
            append_images=frames[1:],
            optimize=False,
            duration=35, # Milliseconds per frame
            loop=0
        )
        print(f"Done! Saved to {output_path}")

    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a splash screen GIF.")
    
    parser.add_argument("--input", "-i", default="logo.png", help="Path to input logo PNG")
    parser.add_argument("--output", "-o", default="splash_installer.gif", help="Path to output GIF")
    parser.add_argument("--bg-color", "-bg", default="#000000", help="Background color hex (e.g. #000000)")
    parser.add_argument("--text-color", "-tc", default="#ffffff", help="Text color hex (e.g. #ffffff)")
    parser.add_argument("--spinner-color", "-sc", default="#ffffff", help="Spinner color hex (e.g. #ffffff)")
    
    args = parser.parse_args()

    create_spinner_gif(
        input_path=args.input,
        output_path=args.output,
        bg_color=hex_to_rgb(args.bg_color),
        text_color=hex_to_rgb(args.text_color),
        spinner_color=hex_to_rgb(args.spinner_color)
    )