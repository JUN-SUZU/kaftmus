echo "Installing Deno..."
# Download and run the Deno installation script
# This script will install Deno to the default location
# which is usually ~/.deno/bin/deno
# Ensure you have curl installed to run this command
if ! command -v curl &> /dev/null; then
    echo "curl is not installed. Please install curl and try again."
    exit 1
fi
if ! command -v sh &> /dev/null; then
    echo "sh is not installed. Please install sh and try again."
    exit 1
fi
curl -fsSL https://deno.land/install.sh | sh
