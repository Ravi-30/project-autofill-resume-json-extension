import zipfile
import os
import argparse

def create_zip(source_dir, output_path):
    project_root = os.path.abspath(source_dir)
    zip_path = os.path.abspath(output_path)
    
    # Files and folders to include
    includes = [
        "manifest.json",
        "background.js",
        "content.js",
        "resumeProcessor.js",
        "sidepanel.html",
        "sidepanel.js",
        "styles.css",
        "atsStrategies",
        "icons",
        "README.md",
        "PRIVACY_POLICY.md"
    ]
    
    print(f"Creating {zip_path} from {project_root}...")
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for item in includes:
            path = os.path.join(project_root, item)
            if os.path.exists(path):
                if os.path.isfile(path):
                    # Add file to zip root
                    zipf.write(path, item)
                else:
                    # Add directory contents recursively
                    for root, dirs, files in os.walk(path):
                        for file in files:
                            full_path = os.path.join(root, file)
                            # Create relative path for zip entry (using forward slashes)
                            rel_path = os.path.relpath(full_path, project_root).replace(os.sep, '/')
                            zipf.write(full_path, rel_path)
            else:
                print(f"Warning: {item} not found")

    print(f"Success! {zip_path} created with forward slashes.")

def parse_args():
    parser = argparse.ArgumentParser(description="Package the extension into a zip file.")
    parser.add_argument("--source", default=os.getcwd(), help="Directory containing extension files")
    parser.add_argument("--output", default="extension.zip", help="Output zip path")
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()
    create_zip(args.source, args.output)
