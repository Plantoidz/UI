// SEPOLIA
const plantoidAddr = "0x66078a2061A68d5bA6cDdBc81517837dA0C7d7b5";

let provider = null;
let signer = null;

async function initializeWeb3() {

        if (!window.ethereum) {
            throw new Error("Please install MetaMask!");
        }

        provider = new ethers.BrowserProvider(window.ethereum);

        const network = await provider.getNetwork();
        console.log("Network:", network);

        try {
            // Request account access
            await provider.send("eth_requestAccounts", []);
            signer = await provider.getSigner();



            // Contract Address
            const contractAddress = plantoidAddr;

            const contractABI = [
                "function totalSupply() public view returns (uint256)",
                "function artist() public view returns (address)"     
            ];
            
            // Create a contract instance
            const contract = new ethers.Contract(contractAddress, contractABI, provider);

            // Fetch data from the contract
          
            const seeds = await contract.totalSupply(); // get the number of seeds
            document.querySelector('#total-seeds').textContent = seeds.toString();

              // Get the current balance of the contract
            const balanceWei = await provider.getBalance(contractAddress);
            const balanceEther = ethers.formatEther(balanceWei);
            console.log(`Balance: ${balanceEther} ETH`);

            document.getElementById('current-balance').textContent = `${balanceEther} ETH`;

            
            const formattedAddress = `${plantoidAddr.slice(0, 6)}...${plantoidAddr.slice(-4)}`;
            const contractAddressElement = document.getElementById('contract-address');
            contractAddressElement.textContent = formattedAddress;

               // Add click event to copy the full address
            contractAddressElement.addEventListener('click', () => {
                navigator.clipboard.writeText(plantoidAddr).then(() => {
                    alert('Contract address copied to clipboard!');
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                });
            });

            const artist = await contract.artist();
            const formattedArtist = `${artist.slice(0, 6)}...${artist.slice(-4)}`;
            const artistAddressElement = document.getElementById('artist-address');
            artistAddressElement.textContent = formattedArtist;

               // Add click event to copy the full address
            artistAddressElement.addEventListener('click', () => {
                navigator.clipboard.writeText(artist).then(() => {
                    alert('Contract address copied to clipboard!');
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                });
            });

        } catch (error) {
            console.error("Error connecting to Web3:", error);
        }
}

export async function feedPlantoid(amount) {
    
    try {
        // Define the transaction
        const tx = {
            to: plantoidAddr, 
            value: ethers.parseEther(amount) 
        };

        console.log(signer);

         // Send the transaction
         const transactionResponse = await signer.sendTransaction(tx);
         console.log("Transaction sent:", transactionResponse);

        // Wait for the transaction to be mined
        await transactionResponse.wait();
        console.log("Transaction mined:", transactionResponse);
        // alert("Transaction successful!");
    } catch (error) {
        console.error("Error sending transaction:", error);
        //alert("Transaction failed!");
    }
}

initializeWeb3();