import zipfile
import os
import shutil

def create_zip():
    project_root = os.getcwd()
    zip_name = "extension.zip"
    
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
        "icons"
    ]
    
    print(f"Creating {zip_name}...")
    
    with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED) as zipf:
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

    print(f"Success! {zip_name} created with forward slashes.")

if __name__ == "__main__":
    create_zip()
