// Load dependencies
const { expect } = require('chai');

// Import utilities from Test Helpers
const { BN, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { deployments, getNamedAccounts, ethers } = require('hardhat');
const ConsoleProgressBar = require('console-progress-bar');

const toBN = ethers.BigNumber.from;

describe('Alejandro ERC721A', () => {
  let deployer;
  let random;
  let random2;
  let unlocker;
  let holder;
  let holder2;
  let holder3;
  let spender;
  let allowancesigner;
  let operator;
  const ADDRESS_ZERO = ethers.constants.AddressZero;
  const mybase = "ipfs://RanD0m_CID/";

  var regularPrice;
  var cDAOPrice;
  var blankPrice;
  var vinylPrice;

  const provider = ethers.provider;
  const { hexlify, toUtf8Bytes } = ethers.utils;

  async function signAllowance(account, mintQty, allowanceId, price, signerAccount = allowancesigner) {
    const idBN = toBN(allowanceId).shl(64);
    const idAndQty = idBN.add(mintQty);
    const idAndQtyShifted = idAndQty.shl(128);
    const nonce = idAndQtyShifted.add(price);
    const message = await nftContract.createMessage(account, nonce);
  
    //const formattedMessage = hexlify(toUtf8Bytes(message));
    const formattedMessage = hexlify(message);
    const addr = signerAccount.address.toLowerCase();
  
    /*
    const signature = await signerAccount.signMessage(
        ethers.utils.arrayify(message),
    );
    */
  
    const signature = await provider.send('eth_sign', [addr, formattedMessage]);
  
    return { nonce, signature };
  }

  beforeEach(async () => {
      [deployer, random, random2, unlocker, holder, holder2, holder3, spender, allowancesigner, operator] = await ethers.getSigners();

      // get chainId
      chainId = await ethers.provider.getNetwork().then((n) => n.chainId);

      const NFT = await ethers.getContractFactory('LocomotorasA', deployer);
      nftContract = await NFT.deploy(mybase);

      await nftContract.connect(deployer).switchSaleState();
      await nftContract.connect(deployer).setAllowancesSigner(await allowancesigner.getAddress());

      regularPrice = await nftContract.regularPrice();
      cDAOPrice  = await nftContract.cDAOPrice();
      blankPrice = await nftContract.blankHoldersPrice();
      vinylPrice = await nftContract.vinylHoldersPrice();

      const BlankToken = await ethers.getContractFactory('BlankToken', deployer);
      blankContract = await BlankToken.deploy(mybase);
      blankContractAddress = blankContract.address;

      await nftContract.connect(deployer).setBlankContract(blankContractAddress);

      await blankContract.connect(deployer).switchSaleState();
      await blankContract.connect(deployer).switchMergeState();
      await blankContract.connect(deployer).setAllowancesSigner(await allowancesigner.getAddress());

  });

  describe('Deployment', async function () {
    
    it('deploys', async function () {
        expect(nftContract.address).to.not.equal("");
    });

    it('deploys with correct base URI', async function () {
      
      const mintQty = 1;
      const { nonce: nonce, signature: allowance } = await signAllowance(
          await random.getAddress(),
          mintQty,
          Math.floor(Math.random() * 1000 * (await provider.getBlockNumber())), //some random allowance id
          regularPrice
      );

      await nftContract.connect(random).mint(await random.getAddress(), nonce, allowance, {value: regularPrice});

      console.log(await nftContract.tokenURI((await nftContract.nextTokenIndex()).sub(1)));

      expect(await nftContract.tokenURI((await nftContract.nextTokenIndex()).sub(1))).to.include(mybase);
    });

    it('deploys with 0 tokens', async function () {
      expect(await nftContract.totalSupply()).to.equal(0);
    });
  });

  /*  ====== ====== ====== ====== ====== ======
    *   
    *   PRESALE MINTING TESTS
    * 
    * ====== ====== ====== ====== ======  ====== */

  describe('Presale minting', async function () {

    it('can mint token with a signature', async function () {
      const mintQty = 1;
      const { nonce: nonce, signature: allowance } = await signAllowance(
          await random.getAddress(),
          mintQty,
          Math.floor(Math.random() * 1000 * (await provider.getBlockNumber())), //some random allowance id
          regularPrice
      );
      
      await nftContract.connect(random).mint(await random.getAddress(), nonce, allowance, {value: regularPrice});

      expect(
          await nftContract.balanceOf(await random.getAddress()),
      ).to.be.equal(mintQty);
  });

  it('can mint token with cdao price', async function () {
      const mintQty = 5;
      const { nonce: nonce, signature: allowance } = await signAllowance(
          await random.getAddress(),
          mintQty,
          Math.floor(Math.random() * 1000 * (await provider.getBlockNumber())), //some random allowance id
          cDAOPrice
      );
      
      await nftContract.connect(random).mint(await random.getAddress(), nonce, allowance, {value: cDAOPrice.mul(mintQty)});

      expect(
          await nftContract.balanceOf(await random.getAddress()),
      ).to.be.equal(mintQty);
  });
  
  it('can mint token with an allowance made for other person that was not used yet to other person wallet', async function () {

      const mintQty = 1;
      const { nonce: nonce, signature: allowance } = await signAllowance(
          await random.getAddress(),
          mintQty,
          Math.floor(Math.random() * 1000 * (await provider.getBlockNumber())), //some random allowance id
          regularPrice
      );
        
      await nftContract.connect(random2).mint(await random.getAddress(), nonce, allowance, {value: regularPrice});

      expect(
          await nftContract.balanceOf(await random.getAddress()),
      ).to.be.equal(mintQty);
  });
  
   
  it('can mint several quotas with same capacity but diff nonce', async function () {

    const mintQty = 1;
    const quotas = 3;

    for (let i=0; i<quotas; i++) {
      const { nonce: nonce, signature: allowance } = await signAllowance(
          await random.getAddress(),
          mintQty,
          Math.floor(Math.random() * 1000), //some random allowance id
          regularPrice
      );

      await nftContract.connect(random).mint(await random.getAddress(), nonce, allowance, {value: regularPrice});

    }
    expect(
        await nftContract.balanceOf(await random.getAddress()),
    ).to.be.equal(mintQty*quotas);
  });

  it('cannot mint with lower eth sent', async function () {

    const mintQty = 3;
    const allowId = Math.floor(Math.random() * 1000 * (await provider.getBlockNumber()));
    const { nonce: nonce, signature: allowance } = await signAllowance(
          await random.getAddress(),
          mintQty,
          allowId, //some random allowance id
          cDAOPrice
    );

    await expect(
      nftContract.connect(random).mint(await random.getAddress(), nonce, allowance, {value: cDAOPrice.mul(mintQty-1)}),
    ).to.be.revertedWith('mint(): Not Enough Eth');
  });

  it('cannot reuse signature', async function () {

    const mintQty = 1;
    const allowId = Math.floor(Math.random() * 1000 * (await provider.getBlockNumber()));
    const { nonce: nonce, signature: allowance } = await signAllowance(
          await random.getAddress(),
          mintQty,
          allowId, //some random allowance id
          regularPrice
    );
    await nftContract.connect(random).mint(await random.getAddress(), nonce, allowance, {value: regularPrice});
    //console.log("cannot reuse sig: 1st mint ok");

    await expect(
      nftContract.connect(random).mint(await random.getAddress(), nonce, allowance, {value: regularPrice}),
    ).to.be.revertedWith('!ALREADY_USED!');
  });

  it('cannot mint to yourself with other persons allowance', async function () {

    const mintQty = 1;
    const allowId = Math.floor(Math.random() * 1000 * (await provider.getBlockNumber()));
      const { nonce: nonce, signature: allowance } = await signAllowance(
          await random.getAddress(),
          mintQty,
          allowId, //some random allowance id
          regularPrice
      );

    await expect(
      nftContract.connect(random2).mint(await random2.getAddress(), nonce, allowance, {value: regularPrice}),
    ).to.be.revertedWith('!INVALID_SIGNATURE!');
  });

  it('cannot mint with signature by wrong signer', async function () {

    const mintQty = 1;
      const { nonce: nonce, signature: allowance } = await signAllowance(
          await random.getAddress(),
          mintQty,
          Math.floor(Math.random() * 1000), 
          regularPrice,
          random2
      );

    await expect(
      nftContract.connect(random).mint(await random.getAddress(), nonce, allowance, {value: regularPrice}),
    ).to.be.revertedWith('!INVALID_SIGNATURE!');
  });

  it('cannot mint with previously valid signature when we revoked everyhting by changing signer in the contract', async function () {
    
    const mintQty = 1;
      const { nonce: nonce, signature: allowance } = await signAllowance(
          await random.getAddress(),
          mintQty,
          Math.floor(Math.random() * 1000), 
          regularPrice
      );
      
      await nftContract.connect(deployer).setAllowancesSigner(random.address);
    await expect(
      nftContract.connect(random).mint(await random.getAddress(), nonce, allowance, {value: regularPrice}),
    ).to.be.revertedWith('!INVALID_SIGNATURE!');
  });

  it('non owner can not change signer', async function () {
    await expect(
      nftContract.connect(random).setAllowancesSigner(random.address),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });

  
  it('cannot mint with decreased price', async function () {

    const mintQty = 1;
      const { nonce: nonce, signature: allowance } = await signAllowance(
          await random.getAddress(),
          mintQty,
          Math.floor(Math.random() * 1000), 
          regularPrice
      );

      const nonce2 = nonce.sub(regularPrice).add(100);

    await expect(
      nftContract.connect(random).mint(await random.getAddress(), nonce2, allowance, {value: 100}),
    ).to.be.revertedWith('!INVALID_SIGNATURE!');
  });
  

  it('cannot manipulate signature', async function () {

    const mintQty = 1;
      let { nonce: nonce, signature: allowance } = await signAllowance(
          await random.getAddress(),
          mintQty,
          345, //some random id
          regularPrice
      );

      //trying to mess with signature somehow
      allowance = 
            '0x45eacf01' + allowance.substr(-(allowance.length - 10));
      //console.log("Changed allowance: ", allowance);

    await expect(
      nftContract.connect(random).mint(await random.getAddress(), nonce, allowance, {value: 100}),
    ).to.be.reverted;
  }); 

  it('can not order before presale started', async function () {
    let tx = await nftContract.connect(deployer).switchSaleState();
    await tx.wait();

    expect((await nftContract.saleState())).to.be.false;

    const mintQty = 1;
      const { nonce: nonce, signature: allowance } = await signAllowance(
          await random.getAddress(),
          mintQty,
          Math.floor(Math.random() * 1000 * (await provider.getBlockNumber())), //some random allowance id
          regularPrice
      );

    await expect (
      nftContract.connect(random).mint(await random.getAddress(), nonce, allowance, {value: regularPrice}),
    ).to.be.revertedWith('Presale not active');          
  });

  // commented out for speed, passes.
/*
  it('can not order Over Capacity', async function () {
  
    const mintQty = 1;

    const capacity = await nftContract.MAX_ITEMS();

    const consoleProgressBar = new ConsoleProgressBar({ maxValue: capacity });

    // claim all tokens
    for (let i=0; i<capacity; i++) {
      
      const { nonce: nonce, signature: allowance } = await signAllowance(
          await random.getAddress(),
          mintQty,
          Math.floor(Math.random() * 10000 * (await provider.getBlockNumber())), //some random allowance id
          regularPrice
      );

      await nftContract.connect(random).mint(await random.getAddress(), nonce, allowance, {value: regularPrice});
      consoleProgressBar.addValue(1);
    }

    // all tokens are claimed
    expect(await nftContract.totalSupply()).to.equal(capacity);

    // exceeded mint
    const { nonce: nonce, signature: allowance } = await signAllowance(
      await random.getAddress(),
      mintQty,
      Math.floor(Math.random() * 1000 * (await provider.getBlockNumber())), //some random allowance id
      regularPrice
    );

    await expect (

      nftContract.connect(random).mint(await random.getAddress(), nonce, allowance, {value: regularPrice}),

    ).to.be.revertedWith('>MaxSupply');          
  });
  */

});

/*  ====== ====== ====== ====== ====== ======
    *   
    *   VIEW FUNCTIONS TESTS
    * 
    * ====== ====== ====== ====== ======  ====== */

describe('View functions tests', async function () {

  it('can return correct tokens of Owner without burning', async function () {

    const mintQty = 1;

    expect(await nftContract.totalSupply()).to.equal(0);
    expect(await nftContract.balanceOf(await random.getAddress())).to.equal(0);

    let totMintedBeforeTest = await nftContract.totalSupply();

    await nftContract.connect(deployer).adminMint(await random.getAddress(), mintQty);
    await nftContract.connect(deployer).adminMint(await random2.getAddress(), mintQty);
    await nftContract.connect(deployer).adminMint(await random.getAddress(), mintQty);
    await nftContract.connect(deployer).adminMint(await deployer.getAddress(), mintQty);
    await nftContract.connect(deployer).adminMint(await holder.getAddress(), mintQty);
    await nftContract.connect(deployer).adminMint(await random.getAddress(), mintQty);
    
    let minted = (await nftContract.totalSupply());
    
    //the starting index of the collection
    let startIndex = (await nftContract.nextTokenIndex()).sub(minted);

    let expToO = [toBN((startIndex.add(totMintedBeforeTest)).add(0)), 
                  toBN((startIndex.add(totMintedBeforeTest)).add(2)), 
                  toBN((startIndex.add(totMintedBeforeTest)).add(5))];
    
    let gotToO = await nftContract.tokensOfOwner(await random.getAddress());
    
    for (let i=0; i<expToO.length; i++) {
      //console.log("got from contract: " , gotToO[i]);
      expect(gotToO[i]).to.equal(expToO[i]);
    }

  }); 

});


/*  ====== ====== ====== ====== ====== ======
    *   
    *   ADMIN FUNCTIONS TESTS
    * 
    * ====== ====== ====== ====== ======  ====== */

describe('Admin functions tests', async function () {

  it('can change baseUri', async function () {

    let oldBaseUri = await nftContract.baseURI();
    
    let newBaseExp = "site.com";
    let tx = await nftContract.connect(deployer).setBaseURI(newBaseExp);
    await tx.wait();

    let newBaseSet = await nftContract.baseURI();
    
    expect(newBaseSet).to.equal(newBaseExp).and.to.not.equal(oldBaseUri);
  }); 

  it('can not set BaseURI if not admin: test onlyOwner function', async function () {
    await expect(
        nftContract.connect(random).setBaseURI("fddfsf"),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });

  it('can AdminMint', async function () {
    const mintQty = 1;
    expect(await nftContract.totalSupply()).to.equal(0);
    await nftContract.connect(deployer).adminMint(await random.getAddress(), mintQty);
    expect(await nftContract.totalSupply()).to.equal(mintQty);
    expect(await nftContract.balanceOf(await random.getAddress())).to.equal(mintQty);
  });

  it('can not adminMint if not admin: test onlyOwner function', async function () {
    const mintQty = 1;
    await expect(
        nftContract.connect(random).adminMint(await random.getAddress(), mintQty),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });

  // WITHDRAWALS TEST
  it('can not withdraw if not admin', async function () {
    await expect(
        nftContract.connect(random).withdraw(100000),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });

  it('can withdraw', async function () {
    
    let amt = regularPrice.sub(1000000000); //little bit less

    const mintQty = 1;
    const { nonce: nonce, signature: allowance } = await signAllowance(
          await random.getAddress(),
          mintQty,
          Math.floor(Math.random() * 1000 * (await provider.getBlockNumber())), //some random allowance id
          regularPrice
    );
      
    price = 
    await nftContract.connect(random).mint(await random.getAddress(), nonce, allowance, {value: regularPrice});

    expect(
          await nftContract.balanceOf(await random.getAddress()),
    ).to.be.equal(mintQty);
        
    let balBefore = toBN(await deployer.getBalance());
    
    let txW = await nftContract.connect(deployer).withdraw(amt);
    await txW.wait();

    let balAfter = await deployer.getBalance();

    let diff = balAfter.sub(balBefore);
    //console.log("Diff: ", ethers.utils.formatUnits(diff, unit = "ether"), "eth");
    expect(diff).to.be.above(amt.sub(toBN(10).pow(15)));

  });

});


/*  ====== ====== ====== ====== ====== ======
    *   
    *   Blank token MINTS TESTS
    * 
    * ====== ====== ====== ====== ======  ====== */

describe('Blank Token holders mint', async function () {

  beforeEach(async () => {  
    
    await blankContract.connect(deployer).adminMint(await holder.getAddress(), 2);
    await blankContract.connect(deployer).adminMint(await holder2.getAddress(), 3);
    await blankContract.connect(deployer).adminMint(await holder3.getAddress(), 1);
    await blankContract.connect(deployer).adminMint(await holder.getAddress(), 3);

  });

  it('Can mint for one of his tokens', async function () {
    let holderBlankTokenIds = await blankContract.tokensOfOwner(holder2.getAddress());

    expect(await nftContract.totalSupply()).to.equal(0);

    let mtTx = await nftContract.connect(holder2).blankHoldersMint([holderBlankTokenIds[0]], {value: blankPrice});
    await mtTx.wait();

    expect(await nftContract.totalSupply()).to.equal(1);
    expect(await nftContract.balanceOf(await holder2.getAddress())).to.equal(1);

  }); 

  it('Can mint for all of his tokens', async function () {
    let holderBlankTokenIds = await blankContract.tokensOfOwner(holder.getAddress());

    expect(await nftContract.totalSupply()).to.equal(0);

    let mtTx = await nftContract.connect(holder).blankHoldersMint(holderBlankTokenIds, {value: blankPrice.mul(holderBlankTokenIds.length)});
    await mtTx.wait();

    expect(await nftContract.totalSupply()).to.equal(holderBlankTokenIds.length);
    expect(await nftContract.balanceOf(await holder.getAddress())).to.equal(holderBlankTokenIds.length);

  });

  it('Can mint one by one twice', async function () {
    let holderBlankTokenIds = await blankContract.tokensOfOwner(holder2.getAddress());

    expect(await nftContract.totalSupply()).to.equal(0);

    let mtTx = await nftContract.connect(holder2).blankHoldersMint([holderBlankTokenIds[0]], {value: blankPrice});
    await mtTx.wait();

    expect(await nftContract.totalSupply()).to.equal(1);
    expect(await nftContract.balanceOf(await holder2.getAddress())).to.equal(1);

    mtTx = await nftContract.connect(holder2).blankHoldersMint([holderBlankTokenIds[1]], {value: blankPrice});
    await mtTx.wait();

    expect(await nftContract.totalSupply()).to.equal(2);
    expect(await nftContract.balanceOf(await holder2.getAddress())).to.equal(2);

  }); 

  it('Different holders can mint subsequently', async function () {
    
    let totalExpected = 0;
    let holderBlankTokenIds = await blankContract.tokensOfOwner(holder.getAddress());

    expect(await nftContract.totalSupply()).to.equal(0);

    let mtTx = await nftContract.connect(holder).blankHoldersMint(holderBlankTokenIds, {value: blankPrice.mul(holderBlankTokenIds.length)});
    await mtTx.wait();
    totalExpected += holderBlankTokenIds.length;

    expect(await nftContract.balanceOf(await holder.getAddress())).to.equal(holderBlankTokenIds.length);

    // holder 2

    holderBlankTokenIds = await blankContract.tokensOfOwner(holder2.getAddress());
    mtTx = await nftContract.connect(holder2).blankHoldersMint(holderBlankTokenIds, {value: blankPrice.mul(holderBlankTokenIds.length)});
    await mtTx.wait();
    totalExpected += holderBlankTokenIds.length;
    expect(await nftContract.balanceOf(await holder2.getAddress())).to.equal(holderBlankTokenIds.length);

    // holder 3
    holderBlankTokenIds = await blankContract.tokensOfOwner(holder3.getAddress());
    mtTx = await nftContract.connect(holder3).blankHoldersMint(holderBlankTokenIds, {value: blankPrice.mul(holderBlankTokenIds.length)});
    await mtTx.wait();
    totalExpected += holderBlankTokenIds.length;
    expect(await nftContract.balanceOf(await holder3.getAddress())).to.equal(holderBlankTokenIds.length);

    expect(await nftContract.totalSupply()).to.equal(totalExpected);

  }); 

  it('can not mint for the same token twice', async function () {

    let holderBlankTokenIds = await blankContract.tokensOfOwner(holder2.getAddress());

    expect(await nftContract.totalSupply()).to.equal(0);

    let mtTx = await nftContract.connect(holder2).blankHoldersMint([holderBlankTokenIds[0]], {value: blankPrice});
    await mtTx.wait();

    expect(await nftContract.totalSupply()).to.equal(1);
    expect(await nftContract.balanceOf(await holder2.getAddress())).to.equal(1);

    // try same 
    mtTx = await nftContract.connect(holder2).blankHoldersMint([holderBlankTokenIds[0]], {value: blankPrice});
    await mtTx.wait();

    // no tokens minted
    expect(await nftContract.totalSupply()).to.equal(1);
    expect(await nftContract.balanceOf(await holder2.getAddress())).to.equal(1);

    //await expect(
    //  nftContract.connect(holder2).blankHoldersMint([holderBlankTokenIds[0]], {value: blankPrice})).to.be.revertedWith('Blank Token: Merging has not started yet');

  });

  it('Can not mint twice complex scenario', async function () {
    let holderBlankTokenIds = await blankContract.tokensOfOwner(holder.getAddress());

    expect(await nftContract.totalSupply()).to.equal(0);

    // Mint for one of the tokens
    let mtTx = await nftContract.connect(holder).blankHoldersMint([holderBlankTokenIds[0]], {value: blankPrice});
    await mtTx.wait();
    expect(await nftContract.totalSupply()).to.equal(1);
    expect(await nftContract.balanceOf(await holder.getAddress())).to.equal(1);

    // Mint for all of the tokens even for the used one
    mtTx = await nftContract.connect(holder).blankHoldersMint(holderBlankTokenIds, {value: blankPrice.mul(holderBlankTokenIds.length)});
    await mtTx.wait();

    // Overall should not mint more than all the tokens amount
    expect(await nftContract.totalSupply()).to.equal(holderBlankTokenIds.length);
    expect(await nftContract.balanceOf(await holder.getAddress())).to.equal(holderBlankTokenIds.length);
  });

  it('Can mint with replacement wallet', async function () {
    expect(await nftContract.totalSupply()).to.equal(0);
    expect(await nftContract.balanceOf(await random.getAddress())).to.equal(0);
    
    // make replacement
    let replTx = await nftContract.connect(holder).replaceWallet(random.getAddress());
    await replTx.wait();

    let tokenOwner = await nftContract.checkReplacement(random.getAddress());
    expect(tokenOwner).to.equal(await holder.getAddress());
    
    let holderBlankTokenIds = await blankContract.tokensOfOwner(tokenOwner);

    expect(await nftContract.totalSupply()).to.equal(0);

    let mtTx = await nftContract.connect(random).blankHoldersMint(holderBlankTokenIds, {value: blankPrice.mul(holderBlankTokenIds.length)});
    await mtTx.wait();

    expect(await nftContract.totalSupply()).to.equal(holderBlankTokenIds.length);
    expect(await nftContract.balanceOf(await random.getAddress())).to.equal(holderBlankTokenIds.length);
  });

  it('Can mint from the original holder even if there is replacement wallet ans then can mint with replacement', async function () {
    expect(await nftContract.totalSupply()).to.equal(0);
    expect(await nftContract.balanceOf(await random.getAddress())).to.equal(0);
    
    // make replacement
    let replTx = await nftContract.connect(holder).replaceWallet(random.getAddress());
    await replTx.wait();

    let tokenOwner = await nftContract.checkReplacement(random.getAddress());
    expect(tokenOwner).to.equal(await holder.getAddress());
    
    let holderBlankTokenIds = await blankContract.tokensOfOwner(tokenOwner);

    expect(await nftContract.totalSupply()).to.equal(0);

    //mint from the og holder wallet
    let mtTx = await nftContract.connect(holder).blankHoldersMint([holderBlankTokenIds[0]], {value: blankPrice});
    await mtTx.wait();
    expect(await nftContract.totalSupply()).to.equal(1);
    expect(await nftContract.balanceOf(await holder.getAddress())).to.equal(1);

    mtTx = await nftContract.connect(random).blankHoldersMint(holderBlankTokenIds, {value: blankPrice.mul(holderBlankTokenIds.length)});
    await mtTx.wait();

    expect(await nftContract.totalSupply()).to.equal(holderBlankTokenIds.length);
    expect(await nftContract.balanceOf(await random.getAddress())).to.equal(holderBlankTokenIds.length - 1);
  });

  it('can not mint for others tokens', async function () {

    let holderBlankTokenIds = await blankContract.tokensOfOwner(holder2.getAddress());
    
    expect(await nftContract.balanceOf(await holder2.getAddress())).to.equal(0);
    expect(await nftContract.balanceOf(await random.getAddress())).to.equal(0);
    expect(await nftContract.totalSupply()).to.equal(0);

    let mtTx = await nftContract.connect(random).blankHoldersMint([holderBlankTokenIds[0]], {value: blankPrice});
    await mtTx.wait();

    expect(await nftContract.totalSupply()).to.equal(0);
    expect(await nftContract.balanceOf(await holder2.getAddress())).to.equal(0);
    expect(await nftContract.balanceOf(await random.getAddress())).to.equal(0);

  });

  it('returns change', async function () {

    let holderBlankTokenIds = await blankContract.tokensOfOwner(holder.getAddress());

    expect(await nftContract.totalSupply()).to.equal(0);

    let balBefore = toBN(await holder.getBalance());

    // Mint for one of the tokens
    let mtTx = await nftContract.connect(holder).blankHoldersMint([holderBlankTokenIds[0]], {value: blankPrice});
    await mtTx.wait();
    expect(await nftContract.totalSupply()).to.equal(1);
    expect(await nftContract.balanceOf(await holder.getAddress())).to.equal(1);

    // Mint for all of the tokens even for the used one
    mtTx = await nftContract.connect(holder).blankHoldersMint(holderBlankTokenIds, {value: blankPrice.mul(holderBlankTokenIds.length)});
    await mtTx.wait();

    // Overall should not mint more than all the tokens amount
    expect(await nftContract.totalSupply()).to.equal(holderBlankTokenIds.length);
    expect(await nftContract.balanceOf(await holder.getAddress())).to.equal(holderBlankTokenIds.length);

    let balAfter = toBN(await holder.getBalance());

    // difference should be for holderBlankTokenIds.length tokens, not for holderBlankTokenIds.length + 1 tokens
    // coz we pay for holderBlankTokenIds.length + 1, but we get return
    let expectedSpent = (blankPrice.mul(holderBlankTokenIds.length)).add(toBN(10).pow(16)) ; //price + gas. we add 0.01 for gas, that is less than 0.035
    expect(balBefore.sub(balAfter)).to.be.below(expectedSpent);

  });

});

/*  ====== ====== ====== ====== ====== ======
    *   
    *   Blank token MINTS TESTS
    * 
    * ====== ====== ====== ====== ======  ====== */

describe('Vinyl Token holders mint', async function () {

  beforeEach(async () => {  
    await blankContract.connect(deployer).adminMint(await holder.getAddress(), 4); //0-3
    await blankContract.connect(deployer).adminMint(await holder2.getAddress(), 3); //4-6
    await blankContract.connect(deployer).adminMint(await holder3.getAddress(), 2); // 7,8
    await blankContract.connect(deployer).adminMint(await holder.getAddress(), 4); // 9-12
    await blankContract.connect(deployer).adminMint(await holder2.getAddress(), 2); // 12-14

    await blankContract.connect(holder).mergeTokens(0, 2); // 15
    await blankContract.connect(holder2).mergeTokens(5, 13); // 16
    await blankContract.connect(holder3).mergeTokens(7, 8); // 17
    await blankContract.connect(holder).mergeTokens(3, 10); // 18
    await blankContract.connect(holder2).mergeTokens(6, 14); // 19
    await blankContract.connect(holder).mergeTokens(9, 11); // 20

    //console.log("Last merged: ", await blankContract.nextTokenIndex() - 1);

  });

  it('Can mint both tokens for one of his tokens and one for another and then another one', async function () {
    let holderBlankTokenIds = await blankContract.tokensOfOwner(holder.getAddress());
    let holderVinylTokenIds = [];
    let holderVinylTokenIdsAlls = [];
    //console.log(holderBlankTokenIds);

    for (const tokenId of holderBlankTokenIds){
      if(tokenId >= await blankContract.MAX_ITEMS()) {
        holderVinylTokenIds.push(tokenId);
        holderVinylTokenIdsAlls.push(2);
      }
    }
    //console.log(holderVinylTokenIds);

    expect(await nftContract.totalSupply()).to.equal(0);

    let mtTx = await nftContract.connect(holder).vinylHoldersMint([holderVinylTokenIds[0]], [holderVinylTokenIdsAlls[0]], {value: vinylPrice.mul(holderVinylTokenIdsAlls[0])});
    await mtTx.wait();

    expect(await nftContract.totalSupply()).to.equal(2);
    expect(await nftContract.balanceOf(await holder.getAddress())).to.equal(2);

    mtTx = await nftContract.connect(holder).vinylHoldersMint([holderVinylTokenIds[1]], [1], {value: vinylPrice});
    await mtTx.wait();

    expect(await nftContract.totalSupply()).to.equal(3);
    expect(await nftContract.balanceOf(await holder.getAddress())).to.equal(3);

    mtTx = await nftContract.connect(holder).vinylHoldersMint([holderVinylTokenIds[1]], [1], {value: vinylPrice});
    await mtTx.wait();

    expect(await nftContract.totalSupply()).to.equal(4);
    expect(await nftContract.balanceOf(await holder.getAddress())).to.equal(4);

  }); 

  it('Can not mint 3 for one Vinyl', async function () {
    let holderBlankTokenIds = await blankContract.tokensOfOwner(holder.getAddress());
    let holderVinylTokenIds = [];
    let holderVinylTokenIdsAlls = [];
    //console.log(holderBlankTokenIds);

    for (const tokenId of holderBlankTokenIds){
      if(tokenId >= await blankContract.MAX_ITEMS()) {
        holderVinylTokenIds.push(tokenId);
        holderVinylTokenIdsAlls.push(2);
      }
    }
    //console.log(holderVinylTokenIds);

    expect(await nftContract.totalSupply()).to.equal(0);

    let mtTx = await nftContract.connect(holder).vinylHoldersMint([holderVinylTokenIds[0]], [holderVinylTokenIdsAlls[0]], {value: vinylPrice.mul(holderVinylTokenIdsAlls[0])});
    await mtTx.wait();

    expect(await nftContract.totalSupply()).to.equal(2);
    expect(await nftContract.balanceOf(await holder.getAddress())).to.equal(2);

    await expect(
      nftContract.connect(holder).vinylHoldersMint([holderVinylTokenIds[0]], [1], {value: vinylPrice})
    ).to.be.revertedWith('Vinyl token mint limit exceeded');
  
  }); 

  it('Can not send less eth', async function () {
    let holderBlankTokenIds = await blankContract.tokensOfOwner(holder.getAddress());
    let holderVinylTokenIds = [];
    let holderVinylTokenIdsAlls = [];
    //console.log(holderBlankTokenIds);

    for (const tokenId of holderBlankTokenIds){
      if(tokenId >= await blankContract.MAX_ITEMS()) {
        holderVinylTokenIds.push(tokenId);
        holderVinylTokenIdsAlls.push(2);
      }
    }
    //console.log(holderVinylTokenIds);

    expect(await nftContract.totalSupply()).to.equal(0);

    //we try to mint 2 tokens paying for 1 only
    await expect(
      nftContract.connect(holder).vinylHoldersMint([holderVinylTokenIds[0]], [holderVinylTokenIdsAlls[0]], {value: vinylPrice})
    ).to.be.reverted;

    expect(await nftContract.totalSupply()).to.equal(0);
    expect(await nftContract.balanceOf(await holder.getAddress())).to.equal(0);
  
  }); 

  it('Returns change', async function () {
    let holderBlankTokenIds = await blankContract.tokensOfOwner(holder.getAddress());
    let holderVinylTokenIds = [];
    let holderVinylTokenIdsAlls = [];
    //console.log(holderBlankTokenIds);

    for (const tokenId of holderBlankTokenIds){
      if(tokenId >= await blankContract.MAX_ITEMS()) {
        holderVinylTokenIds.push(tokenId);
        holderVinylTokenIdsAlls.push(2);
      }
    }
    //console.log(holderVinylTokenIds);

    let balBefore = toBN(await holder.getBalance());
    expect(await nftContract.totalSupply()).to.equal(0);

    //mint 2 pay for 3
    let mtTx = await nftContract.connect(holder).vinylHoldersMint([holderVinylTokenIds[0]], [holderVinylTokenIdsAlls[0]], {value: vinylPrice.mul(holderVinylTokenIdsAlls[0]+1)});
    await mtTx.wait();

    expect(await nftContract.totalSupply()).to.equal(2);
    expect(await nftContract.balanceOf(await holder.getAddress())).to.equal(2);

    let balAfter = toBN(await holder.getBalance());

    // difference should be for holderBlankTokenIds.length tokens, not for holderBlankTokenIds.length + 1 tokens
    // coz we pay for holderBlankTokenIds.length + 1, but we get return
    let expectedSpent = (vinylPrice.mul(2)).add((toBN(10).pow(15)).mul(5)) ; //price + gas. we add 0.005 for gas, that is less than 0.01
    expect(balBefore.sub(balAfter)).to.be.below(expectedSpent);
  
  }); 

  it('Can mint with replacement wallet', async function () {

     // make replacement
     let replTx = await nftContract.connect(holder).replaceWallet(random.getAddress());
     await replTx.wait();
 
     let tokenOwner = await nftContract.checkReplacement(random.getAddress());
     expect(tokenOwner).to.equal(await holder.getAddress());

    let holderBlankTokenIds = await blankContract.tokensOfOwner(tokenOwner);
    let holderVinylTokenIds = [];
    let holderVinylTokenIdsAlls = [];
    //console.log(holderBlankTokenIds);

    for (const tokenId of holderBlankTokenIds){
      if(tokenId >= await blankContract.MAX_ITEMS()) {
        holderVinylTokenIds.push(tokenId);
        holderVinylTokenIdsAlls.push(2);
      }
    }
    //console.log(holderVinylTokenIds);

    expect(await nftContract.totalSupply()).to.equal(0);

    // mint 2 from og
    let mtTx = await nftContract.connect(holder).vinylHoldersMint([holderVinylTokenIds[0]], [holderVinylTokenIdsAlls[0]], {value: vinylPrice.mul(holderVinylTokenIdsAlls[0])});
    await mtTx.wait();

    expect(await nftContract.totalSupply()).to.equal(2);
    expect(await nftContract.balanceOf(await holder.getAddress())).to.equal(2);

    // mint 1 form replacement wallet
    mtTx = await nftContract.connect(random).vinylHoldersMint([holderVinylTokenIds[1]], [1], {value: vinylPrice});
    await mtTx.wait();

    expect(await nftContract.totalSupply()).to.equal(3);
    expect(await nftContract.balanceOf(await random.getAddress())).to.equal(1);
    expect(await nftContract.balanceOf(await holder.getAddress())).to.equal(2);

    // mint 1 from og again
    mtTx = await nftContract.connect(holder).vinylHoldersMint([holderVinylTokenIds[1]], [1], {value: vinylPrice});
    await mtTx.wait();

    expect(await nftContract.totalSupply()).to.equal(4);
    expect(await nftContract.balanceOf(await holder.getAddress())).to.equal(3);

  }); 

  it('Can mint mixed allowances', async function () {
    let holderBlankTokenIds = await blankContract.tokensOfOwner(holder.getAddress());
    let holderVinylTokenIds = [];
    let holderVinylTokenIdsAlls = [];
    //console.log(holderBlankTokenIds);

    for (const tokenId of holderBlankTokenIds){
      if(tokenId >= await blankContract.MAX_ITEMS()) {
        holderVinylTokenIds.push(tokenId);
        holderVinylTokenIdsAlls.push(2);
      }
    }
    //console.log(holderVinylTokenIds);

    // mixed alls
    holderVinylTokenIdsAlls[0] -= 1;
    holderVinylTokenIdsAlls[2] -= 2;
    const sum = holderVinylTokenIdsAlls.reduce((partialSum, a) => partialSum + a, 0);

    expect(await nftContract.totalSupply()).to.equal(0);

    let mtTx = await nftContract.connect(holder).vinylHoldersMint(holderVinylTokenIds, holderVinylTokenIdsAlls, {value: vinylPrice.mul(sum)});
    await mtTx.wait();

    expect(await nftContract.totalSupply()).to.equal(sum);
    expect(await nftContract.balanceOf(await holder.getAddress())).to.equal(sum);
  });

  it('Can mint the full cap', async function () {
    let holderBlankTokenIds = await blankContract.tokensOfOwner(holder.getAddress());
    let holderVinylTokenIds = [];
    let holderVinylTokenIdsAlls = [];
    
    for (const tokenId of holderBlankTokenIds){
      if(tokenId >= await blankContract.MAX_ITEMS()) {
        holderVinylTokenIds.push(tokenId);
        holderVinylTokenIdsAlls.push(2);
      }
    }

    const sum = holderVinylTokenIdsAlls.reduce((partialSum, a) => partialSum + a, 0);

    expect(await nftContract.totalSupply()).to.equal(0);

    let mtTx = await nftContract.connect(holder).vinylHoldersMint(holderVinylTokenIds, holderVinylTokenIdsAlls, {value: vinylPrice.mul(sum)});
    await mtTx.wait();

    expect(await nftContract.totalSupply()).to.equal(sum);
    expect(await nftContract.balanceOf(await holder.getAddress())).to.equal(sum);
  });

});  

/*  ====== ====== ====== ====== ====== ======
    *   
    *   PUBLIC MINT TESTS 
    * 
    * ====== ====== ====== ====== ======  ====== */

describe('Public mint test', async function () {

  beforeEach(async () => {  

    const mintQty = 15;
      const { nonce: nonce, signature: allowance } = await signAllowance(
          await random.getAddress(),
          mintQty,
          Math.floor(Math.random() * 1000 * (await provider.getBlockNumber())), //some random allowance id
          regularPrice
      );
      
      await nftContract.connect(random).mint(await random.getAddress(), nonce, allowance, {value: regularPrice.mul(mintQty)});

  });

  it('can public mint', async function () {

    await nftContract.connect(deployer).switchPublicSaleState();
    let supplBefore = await nftContract.totalSupply();

    expect(await nftContract.balanceOf(await random2.getAddress())).to.equal(0);

    let publMTx = await nftContract.connect(random2).publicMint({value: regularPrice});
    await publMTx.wait();

    expect(await nftContract.totalSupply()).to.equal(supplBefore.add(1));
    expect(await nftContract.balanceOf(await random2.getAddress())).to.equal(1);
    
  }); 

  it('can not public mint before public sale opens', async function () {
    
    expect(await nftContract.balanceOf(await random2.getAddress())).to.equal(0);
    await expect (nftContract.connect(random2).publicMint({value: regularPrice})).to.be.revertedWith("Public Sale not active");
  });

  it('can not public mint with low eth', async function () {
    await nftContract.connect(deployer).switchPublicSaleState();

    expect(await nftContract.balanceOf(await random2.getAddress())).to.equal(0);
    await expect (nftContract.connect(random2).publicMint({value: 10000})).to.be.revertedWith("Not Enough Eth");
  });

});


});