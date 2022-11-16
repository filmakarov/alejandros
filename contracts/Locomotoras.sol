/*
    Alejandro's Locomotoras
            ____
            |DD|____T_
            |_ |_____|<
              @-@-@-oo\
*/

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.14;

import "@rari-capital/solmate/src/tokens/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./SignedAllowance.sol";
import "./OperatorFilterer.sol";

/// @title Alejandro's Locomotoras
/// @author of the contract filio.eth (twitter.com/filmakarov)

interface IPrevCol { 
    function ownerOf(uint256 tokenId) external view returns (address); 
}

contract Locomotoras is ERC721, Ownable, SignedAllowance, OperatorFilterer {  

    using Strings for uint256;
    using Counters for Counters.Counter;

    /*///////////////////////////////////////////////////////////////
                                GENERAL STORAGE
    //////////////////////////////////////////////////////////////*/

    // _tokenIds.current() will always return the last minted tokenId # + 1
    // it is actually the amount of minted tokens as we mint consistently startin from #0
    Counters.Counter private _tokenIds;

    uint256 public constant MAX_ITEMS = 2345;

    IPrevCol private cDAOContract;
    IPrevCol private blankTokenContract;

    string public baseURI;
    bool public saleState;
    bool public publicSaleState;

    uint256 public regularPrice = 35000000000000000; // 0.035 eth
    uint256 public cDAOPrice = 20000000000000000; // 0.02 eth
    uint256 public blankHoldersPrice = 25000000000000000; // 0.025 eth
    uint256 public vinylHoldersPrice = 10000000000000000; // 0.01 eth

    mapping (address => address) public replacedWallets;

    mapping (uint256 => bool) public cDAOClaimed;
    mapping (uint256 => uint256) public blankTokenClaimed;
    
    /*///////////////////////////////////////////////////////////////
                                INITIALISATION
    //////////////////////////////////////////////////////////////*/

    constructor(string memory _myBase) 
        ERC721("Locomotoras", "LMS") 
        OperatorFilterer(address(0x3cc6CddA760b79bAfa08dF41ECFA224f810dCeB6), true) {
            baseURI = _myBase; 
    }

    /*///////////////////////////////////////////////////////////////
                        MINTING LOGIC
    //////////////////////////////////////////////////////////////*/

    // only 1 per user, can't be users in allowlist with more than 1 spot
    function mint(address to, uint256 nonce, bytes memory signature) public payable {
        require (saleState, "Presale not active");
    
        require (msg.value >= regularPrice, "Not Enough Eth");
 
        require(totalSupply() + 1 <= MAX_ITEMS, ">MaxSupply");
        
        // this will throw if the allowance has already been used or is not valid
        _useAllowance(to, nonce, signature);

        // If you try to re-enter here thru onERC721Received, function will revert
        // as your allowance is marked as used
        // Counter won't increment and your token will be overminted by the next minter.
        _safeMint(to, _tokenIds.current()); 
        _tokenIds.increment();        
    }

    // CDAO holders' mints
    function cDAOHoldersMint (uint256[] calldata ownedTokens) external payable {
        require (saleState, "Presale not active");
        require (msg.value >= cDAOPrice * ownedTokens.length, "Not enough eth sent");
        
        address tokenOwner;
        uint256 etherLeft = msg.value;

        if (replacedWallets[msg.sender] != address(0)) {
            tokenOwner = replacedWallets[msg.sender];
        } else {
            tokenOwner = msg.sender;
        }
        for (uint256 i=0; i<ownedTokens.length; i++) {
            uint256 curTokenId = ownedTokens[i];
            if (cDAOContract.ownerOf(curTokenId) == tokenOwner && !cDAOClaimed[curTokenId]) {
                etherLeft -= cDAOPrice; // can't go below zero because of a require above; in any case, no underflows with solidity 8.
                cDAOClaimed[curTokenId] = true;
                require(totalSupply() + 1 <= MAX_ITEMS, ">MaxSupply");
                _safeMint(msg.sender, _tokenIds.current()); 
                _tokenIds.increment();
            }
        }
        // return change if it has left
        if (etherLeft >= 0) {
            // since etherLeft is a local variable, there is no need to clear it,
            // even if someone decides to re-enter, etherLeft will be overwritten by the new msg.value
            // in fact there's no reason to re-enter here as you have to pay every time you call this method
            returnChange(etherLeft);
        }
        
    }

    // Blank Token holders mint
    function blankHoldersMint (uint256[] calldata ownedTokens) external payable {
        require (saleState, "Presale not active");
        require (msg.value >= blankHoldersPrice * ownedTokens.length, "Not enough eth sent");

        address tokenOwner;
        uint256 etherLeft = msg.value;

        if (replacedWallets[msg.sender] != address(0)) {
            tokenOwner = replacedWallets[msg.sender];
        } else {
            tokenOwner = msg.sender;
        }

        for (uint256 i=0; i<ownedTokens.length; i++) {
            uint256 curTokenId = ownedTokens[i];
            if (blankTokenContract.ownerOf(curTokenId) == tokenOwner && blankTokenClaimed[curTokenId]==0 && curTokenId < 1399) {
                etherLeft -= blankHoldersPrice; // can't go below zero because of a require above; in any case, no underflows with solidity 8.
                blankTokenClaimed[curTokenId] += 1;
                require(totalSupply() + 1 <= MAX_ITEMS, ">MaxSupply");
                _safeMint(msg.sender, _tokenIds.current()); 
                _tokenIds.increment();
            }
        }
        // return change if it has left
        if (etherLeft >= 0) {
            // since etherLeft is a local variable, there is no need to clear it,
            // even if someone decides to re-enter, etherLeft will be overwritten by the new msg.value
            // in fact there's no reason to re-enter here as you have to pay every time you call this method
            returnChange(etherLeft);
        }
    }

    // Vinyl holders mint (max 2 per every Vinyl token)
    function vinylHoldersMint (uint256[] calldata ownedTokens, uint256[] calldata usages) external payable {
        require (saleState, "Presale not active");
        require (ownedTokens.length == usages.length, "Array lenghts should match");

        // no msg.value check as it requires a for loop to calculate eth required for the tx
        // if not enough eth is provided, it will throw below

        address tokenOwner;
        uint256 etherLeft = msg.value;

        if (replacedWallets[msg.sender] != address(0)) {
            tokenOwner = replacedWallets[msg.sender];
        } else {
            tokenOwner = msg.sender;
        }

        for (uint256 i=0; i<ownedTokens.length; i++) {
            uint256 curTokenId = ownedTokens[i];
            uint256 tokensToMint = usages[i];
            if (blankTokenContract.ownerOf(curTokenId) == tokenOwner && curTokenId > 1399) {
                // explicitly revert here if usage is wrong - for more clarity
                require(blankTokenClaimed[curTokenId]+tokensToMint<=2, "Vinyl token mint limit exceeded");
                // will revert if goes below zero as no more underflows with solidity 8.
                etherLeft -= vinylHoldersPrice * tokensToMint;
                blankTokenClaimed[curTokenId] += tokensToMint;
                require(totalSupply() + tokensToMint <= MAX_ITEMS, ">MaxSupply");
                for (uint j=0; j<tokensToMint; j++) {
                    _safeMint(msg.sender, _tokenIds.current()); 
                    _tokenIds.increment();
                }
            }
        }
        // return change if it has left
        if (etherLeft >= 0) {
            // since etherLeft is a local variable, there is no need to clear it,
            // even if someone decides to re-enter, etherLeft will be overwritten by the new msg.value
            // in fact there's no reason to re-enter here as you have to pay every time you call this method
            returnChange(etherLeft);
        }
    }

    // public mint, max 1 NFT per tx
    function publicMint() public payable {
        require (publicSaleState, "Public Sale not active");
    
        require(totalSupply() + 1 <= MAX_ITEMS, ">MaxSupply");
        require (msg.value >= regularPrice, "Not Enough Eth");
        
        // If you try to re-enter here thru onERC721Received, 
        // counter won't increment and your token will be overminted by the next minter.
        _safeMint(msg.sender, _tokenIds.current()); 
        _tokenIds.increment();        
    }

    // adminMint
    function adminMint(address to, uint256 qty) public onlyOwner {
        require(totalSupply() + qty <= MAX_ITEMS, ">MaxSupply");
        for (uint256 i=0; i<qty; i++) {
            _safeMint(to, _tokenIds.current()); 
            _tokenIds.increment();
        }
    }

    function returnChange(uint256 amount) private {
            (bool success, ) = (msg.sender).call{value: amount}("");
            if (!success) revert ("Recepient can not accept change");
    }

    /*///////////////////////////////////////////////////////////////
                       ROYALTIES PROTECTION
    //////////////////////////////////////////////////////////////*/

    function transferFrom(address from, address to, uint256 tokenId) public override onlyAllowedOperator(from) {
        super.transferFrom(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) public override onlyAllowedOperator(from) {
        super.safeTransferFrom(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data)
        public
        override
        onlyAllowedOperator(from)
    {
        super.safeTransferFrom(from, to, tokenId, data);
    }

    /*///////////////////////////////////////////////////////////////
                       WALLET MANAGEMENT FOR HOLDERS
    //////////////////////////////////////////////////////////////*/

    function replaceWallet(address newWallet) external {
        replacedWallets[newWallet] = msg.sender;
    }

    /*///////////////////////////////////////////////////////////////
                       PUBLIC METADATA VIEWS
    //////////////////////////////////////////////////////////////*/

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(_exists(tokenId), "Locomotoras: this token does not exist");
        return string(abi.encodePacked(baseURI, tokenId.toString()));
    }

    /*///////////////////////////////////////////////////////////////
                       VIEWS
    //////////////////////////////////////////////////////////////*/

    function totalSupply() public view returns (uint256) {
        return _tokenIds.current();
    }

    /// @notice Iterates over all the exisitng tokens and checks if they belong to the user
    /// This function uses very much resources.
    /// !!! NEVER USE this function with write transactions DIRECTLY. 
    /// Only read from it and then pass data to the write tx
    /// @param tokenOwner user to get tokens of
    /// @return the array of token IDs 
    function tokensOfOwner(address tokenOwner) external view returns(uint256[] memory) {
        uint256 tokenCount = _balanceOf[tokenOwner];
        if (tokenCount == 0) {
            // Return an empty array
            return new uint256[](0);
        } else {
            uint256[] memory result = new uint256[](tokenCount);
            uint256 resultIndex = 0;
            uint256 NFTId;
            for (NFTId = 0; NFTId < _tokenIds.current(); NFTId++) { 
                if (_exists(NFTId)) { 
                    if (_ownerOf[NFTId] == tokenOwner) {
                        result[resultIndex] = NFTId;
                        resultIndex++;
                    }
                } 
            }     
            return result;
        }
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        return (_ownerOf[tokenId] != address(0));
    }

    function nextTokenIndex() public view returns (uint256) {
        return _tokenIds.current();
    }

    /*///////////////////////////////////////////////////////////////
                       ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    function setBaseURI(string memory _newBaseURI) public onlyOwner {
        baseURI = _newBaseURI;
    }

    function switchSaleState() public onlyOwner {
        saleState = !saleState;
    }

    function switchPublicSaleState() public onlyOwner {
        publicSaleState = !publicSaleState;
    }

    function setCDAOContract(address _cDAOAddress) public onlyOwner {
        cDAOContract = IPrevCol(_cDAOAddress);
    }

    function setBlankContract(address _blankTokenAddress) public onlyOwner {
        blankTokenContract = IPrevCol(_blankTokenAddress);
    }

    /// @notice sets allowance signer, this can be used to revoke all unused allowances already out there
    /// @param newSigner the new signer
    function setAllowancesSigner(address newSigner) external onlyOwner {
        _setAllowancesSigner(newSigner);
    }

    /// @notice Withdraws funds from the contract to msg.sender who is always the owner.
    /// No need to use reentrancy guard as receiver is always owner
    /// @param amt amount to withdraw in wei
    function withdraw(uint256 amt) public onlyOwner {
         address payable beneficiary = payable(owner());
        (bool success, ) = beneficiary.call{value: amt}("");
        if (!success) revert ("Withdrawal failed");
    }    

}

//   That's all, folks!